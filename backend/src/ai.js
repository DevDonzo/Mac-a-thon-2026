const { generateContent, isReady } = require('./vertexai');
const vectorStore = require('./vectorStore');
const prompts = require('./prompts');
const logger = require('./logger');
const backboard = require('./backboard');
const { config } = require('./config');

/**
 * RAG-powered query with context retrieval
 */
async function askWithRAG(query, currentFile = null, options = {}) {
    const { queryType = 'general', mentorMode = false } = options;
    const startTime = Date.now();

    // Track retrieval steps for visualization
    const retrievalSteps = [];
    const addStep = (step, data = {}) => {
        retrievalSteps.push({
            step,
            timestamp: Date.now() - startTime,
            ...data
        });
    };

    // Get system prompt based on query type and mentor mode
    let systemPrompt = getSystemPrompt(queryType, mentorMode);
    addStep('system_prompt_selected', { type: mentorMode ? 'mentor' : queryType });

    // Find relevant context from indexed project
    let relevantChunks = [];
    let allScoredChunks = [];
    const stats = vectorStore.getStats();
    addStep('index_check', { totalChunks: stats.totalChunks, hasIndex: stats.totalChunks > 0 });

    if (stats.totalChunks > 0) {
        addStep('embedding_query', { query: query.slice(0, 100) });

        // Get more chunks for visualization (show what was considered)
        let allChunks = await vectorStore.findRelevant(query, 20);

        // If we have a currentFile with content, prioritize chunks from that file
        if (currentFile?.path) {
            const normalizedPath = currentFile.path.replace(/\\/g, '/');
            
            // Separate chunks: from current file vs others
            const currentFileChunks = allChunks.filter(chunk => 
                chunk.path.includes(normalizedPath) || normalizedPath.includes(chunk.path)
            );
            const otherChunks = allChunks.filter(chunk => 
                !chunk.path.includes(normalizedPath) && !normalizedPath.includes(chunk.path)
            );
            
            addStep('file_filtering', { 
                currentFileChunks: currentFileChunks.length,
                otherChunks: otherChunks.length,
                targetFile: normalizedPath
            });

            // Prioritize current file chunks, but keep some others for context
            allChunks = [...currentFileChunks.slice(0, 7), ...otherChunks.slice(0, 3)];
        }

        // Smart filtering:
        // 1. If scores are very high (>0.85), it's likely a specific lookup -> use top 3
        // 2. If scores are moderate (0.7-0.85), it's likely a concept search -> use top 5
        // 3. If scores are low (<0.7), the query might be broad or unrelated -> use top 5 but warn LLM

        const topScore = allChunks[0]?.score || 0;
        let contextQuality = 'low';

        if (topScore > 0.85) contextQuality = 'high';
        else if (topScore > 0.70) contextQuality = 'medium';

        relevantChunks = allChunks.slice(0, 5);
        allScoredChunks = allChunks;

        addStep('chunks_retrieved', {
            retrieved: relevantChunks.length,
            considered: allScoredChunks.length,
            topScore: topScore.toFixed(3),
            quality: contextQuality
        });

        logger.info(`Retrieved ${relevantChunks.length} chunks`, {
            topScore: topScore.toFixed(3),
            quality: contextQuality,
            fromCurrentFile: currentFile?.path ? relevantChunks.filter(c => c.path.includes(currentFile.path)).length : 0
        });

        // Smart Prompt Injection based on retrieval quality
        if (contextQuality === 'low' && !currentFile?.content) {
            systemPrompt += `\n\n[IMPORTANT]: The retrieved context seems to have low relevance (Score: ${topScore.toFixed(2)}). 
            - If the user is asking a broad high-level question (e.g., "how does this app work"), attempt to synthesize an answer from the snippets but acknowledge if you are missing the big picture.
            - If the user is asking something specific and the context is missing, admit that you cannot find the specific code and answer based on general programming knowledge or ask for the file name.
            - DO NOT hallucinate code that isn't in the context.`;
        } else if (contextQuality === 'high') {
            systemPrompt += `\n\n[IMPORTANT]: High-relevance code snippets found. The user is likely asking about specific implementation details. Be precise and quote the code constants/logic directly.`;
        }
    }

    // Build context string
    const retrievedContext = relevantChunks.length > 0
        ? relevantChunks.map((chunk, i) =>
            `--- Context ${i + 1} (${chunk.path}, relevance: ${(chunk.score * 100).toFixed(0)}%) ---\n${chunk.text}`
        ).join('\n\n')
        : 'No indexed project context available.';

    // Include current file if provided - this is the MOST important context
    const currentFileContext = currentFile?.content
        ? `\n\n=== USER'S SELECTED CODE (${currentFile.path}) ===\n\`\`\`\n${currentFile.content}\n\`\`\`\n=== END SELECTED CODE ===\n\nThe user is asking specifically about the code shown above. Focus your answer on this code.`
        : '';

    addStep('context_built', { contextLength: retrievedContext.length + currentFileContext.length });

    // Build full prompt
    const fullPrompt = `${systemPrompt}
${currentFileContext}

PROJECT CONTEXT (for additional reference):
${retrievedContext}

USER QUERY:
${query}

Provide a thorough, educational response. Reference specific files and line numbers when applicable.`;

    addStep('generating_response');

    // Query Gemini (Directly or via Backboard)
    let answer;
    let backboardThreadId = options.threadId;

    if (config.backboard.enabled) {
        // Use Backboard for conversation + persistent memory
        // Thread ID can be passed from the frontend in options
        const result = await backboard.sendMessage(fullPrompt, options.threadId);
        answer = result.answer;
        backboardThreadId = result.threadId; // Get the ID (might be newly created)
    } else {
        // Direct Vertex AI call
        answer = await generateContent(fullPrompt);
    }

    const elapsed = Date.now() - startTime;

    addStep('response_complete', { timeMs: elapsed, engine: config.backboard.enabled ? 'backboard' : 'vertexai' });

    return {
        answer,
        threadId: backboardThreadId, // Return the ID so frontend can sync
        workspacePath: vectorStore.getWorkspacePath(), // Include workspace path
        sources: relevantChunks.map(c => ({
            path: c.path,
            lines: `${c.startLine}-${c.endLine}`,
            startLine: c.startLine,
            endLine: c.endLine,
            relevance: `${(c.score * 100).toFixed(0)}%`,
            score: c.score,
            language: c.language,
            preview: c.text.slice(0, 200) + '...'
        })),
        metadata: {
            timeMs: elapsed,
            mode: stats.totalChunks > 0 ? 'rag' : 'direct',
            mentorMode,
            chunksSearched: stats.totalChunks,
            chunksUsed: relevantChunks.length,
            retrievalSteps,
            allChunksConsidered: allScoredChunks.map(c => ({
                path: c.path,
                score: c.score,
                lines: `${c.startLine}-${c.endLine}`,
                used: relevantChunks.includes(c)
            }))
        }
    };
}

/**
 * Direct query without RAG (for simple questions or when no project indexed)
 */
async function askDirect(query, context = [], options = {}) {
    const { queryType = 'general' } = options;
    const startTime = Date.now();
    const systemPrompt = getSystemPrompt(queryType);

    const contextStr = context.map(c =>
        `File: ${c.path}\n\`\`\`\n${c.content}\n\`\`\``
    ).join('\n\n');

    const fullPrompt = `${systemPrompt}

CODE CONTEXT:
${contextStr || 'No code provided.'}

USER QUERY:
${query}`;

    // Query Gemini (Directly or via Backboard)
    let answer;
    let backboardThreadId = options.threadId;

    if (config.backboard.enabled) {
        const result = await backboard.sendMessage(fullPrompt, options.threadId);
        answer = result.answer;
        backboardThreadId = result.threadId;
    } else {
        answer = await generateContent(fullPrompt);
    }

    const elapsed = Date.now() - startTime;

    return {
        answer,
        threadId: backboardThreadId,
        sources: [],
        metadata: {
            mode: 'direct',
            timeMs: elapsed,
            engine: config.backboard.enabled ? 'backboard' : 'vertexai'
        }
    };
}

/**
 * Analyze code for bugs and issues
 */
async function analyzeCode(code, filePath, options = {}) {
    const fullPrompt = `${prompts.ANALYSIS_PROMPT}

FILE: ${filePath || 'unknown'}
\`\`\`
${code}
\`\`\`

Provide detailed analysis with specific line references.`;

    const answer = await generateContent(fullPrompt);
    return { analysis: answer };
}

/**
 * Generate refactoring suggestions
 */
async function suggestRefactor(code, filePath) {
    const fullPrompt = `${prompts.REFACTOR_PROMPT}

FILE: ${filePath || 'unknown'}
\`\`\`
${code}
\`\`\``;

    const answer = await generateContent(fullPrompt);
    return { suggestions: answer };
}

/**
 * Generate unit tests
 */
async function generateTests(code, filePath) {
    const fullPrompt = `${prompts.TEST_PROMPT}

FILE: ${filePath || 'unknown'}
\`\`\`
${code}
\`\`\``;

    const answer = await generateContent(fullPrompt);
    return { tests: answer };
}

/**
 * Generate architecture diagram
 */
async function generateArchitecture() {
    const stats = vectorStore.getStats();

    if (stats.totalChunks === 0) {
        return { diagram: 'No project indexed. Index a project first.' };
    }

    // Get dependency graph from vector store
    const { nodes, edges } = vectorStore.getDependencyGraph();

    // Sanitize node labels for mermaid syntax
    const sanitizeLabel = (label) => {
        // Remove or replace special characters that break mermaid
        return label
            .replace(/[[\]{}()]/g, '') // Remove brackets and parentheses
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/"/g, "'") // Replace double quotes with single
            .replace(/\|/g, '-') // Replace pipes
            .replace(/\n/g, ' ') // Remove newlines
            .trim();
    };

    // Format nodes for prompt with sanitized labels
    const nodeList = nodes.map(n => {
        const sanitized = sanitizeLabel(n.label);
        return `- ${sanitized} (${n.fullPath})`;
    }).join('\n');

    // Format edges for prompt with sanitized labels
    const edgeList = edges.map(e => {
        const source = sanitizeLabel(e.source.split('/').pop());
        const target = sanitizeLabel(e.target.split('/').pop());
        return `${source} relies on ${target}`;
    }).join('\n');

    const fullPrompt = `${prompts.ARCHITECTURE_PROMPT}

PROJECT FILES:
${nodeList}

OBSERVED DEPENDENCIES (IMPORTS):
${edgeList}

INSTRUCTIONS:
1. Use the observed dependencies to draw arrows between components.
2. Group files logically into subgraphs (e.g. Backend, Frontend, Utilities) based on their paths/names.
3. If a file is not in the dependency list but is in the project files, show it as a standalone node or connect it based on potential inferred relationships (but use dotted lines for inferred).
4. Do NOT hallucinate dependencies that contradict the observed list.
5. IMPORTANT: Use simple node labels without special characters. Wrap labels in quotes if they contain spaces.
6. IMPORTANT: Follow mermaid v11 syntax strictly. Use proper node definitions.`;

    const answer = await generateContent(fullPrompt);


    // Robust extraction of Mermaid code
    let diagram = answer;

    // 1. Match code blocks first
    const codeBlockMatch = answer.match(/```(?:mermaid)?\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
        diagram = codeBlockMatch[1].trim();
    } else {
        // 2. If no code block, find keywords like 'graph TD' and keep everything from there
        const keywords = ['graph TD', 'graph LR', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitGraph'];
        for (const kw of keywords) {
            const index = answer.indexOf(kw);
            if (index !== -1) {
                diagram = answer.substring(index).trim();
                break;
            }
        }
    }

    return { diagram, files: nodes.map(n => n.fullPath) };
}

function getSystemPrompt(queryType, mentorMode = false) {
    // If mentor mode is enabled, use the mentor prompt
    if (mentorMode) {
        return prompts.MENTOR_PROMPT;
    }

    switch (queryType) {
        case 'analyze': return prompts.ANALYSIS_PROMPT;
        case 'refactor': return prompts.REFACTOR_PROMPT;
        case 'test': return prompts.TEST_PROMPT;
        case 'architecture': return prompts.ARCHITECTURE_PROMPT;
        default: return prompts.SYSTEM_PROMPT;
    }
}

module.exports = {
    askWithRAG,
    askDirect,
    analyzeCode,
    suggestRefactor,
    generateTests,
    generateArchitecture
};
