const { generateContent, isReady } = require('./vertexai');
const vectorStore = require('./vectorStore');
const prompts = require('./prompts');
const logger = require('./logger');

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
    const systemPrompt = getSystemPrompt(queryType, mentorMode);
    addStep('system_prompt_selected', { type: mentorMode ? 'mentor' : queryType });

    // Find relevant context from indexed project
    let relevantChunks = [];
    let allScoredChunks = [];
    const stats = vectorStore.getStats();
    addStep('index_check', { totalChunks: stats.totalChunks, hasIndex: stats.totalChunks > 0 });

    if (stats.totalChunks > 0) {
        addStep('embedding_query', { query: query.slice(0, 100) });

        // Get more chunks for visualization (show what was considered)
        const allChunks = await vectorStore.findRelevant(query, 10);
        relevantChunks = allChunks.slice(0, 5);
        allScoredChunks = allChunks;

        addStep('chunks_retrieved', {
            retrieved: relevantChunks.length,
            considered: allScoredChunks.length,
            topScore: relevantChunks[0]?.score?.toFixed(3)
        });

        logger.info(`Retrieved ${relevantChunks.length} relevant chunks`, {
            topScore: relevantChunks[0]?.score?.toFixed(3)
        });
    }

    // Build context string
    const retrievedContext = relevantChunks.length > 0
        ? relevantChunks.map((chunk, i) =>
            `--- Context ${i + 1} (${chunk.path}, relevance: ${(chunk.score * 100).toFixed(0)}%) ---\n${chunk.text}`
        ).join('\n\n')
        : 'No indexed project context available.';

    // Include current file if provided
    const currentFileContext = currentFile?.content
        ? `\n--- Currently Active File: ${currentFile.path} ---\n\`\`\`\n${currentFile.content}\n\`\`\``
        : '';

    addStep('context_built', { contextLength: retrievedContext.length + currentFileContext.length });

    // Build full prompt
    const fullPrompt = `${systemPrompt}

PROJECT CONTEXT:
${retrievedContext}
${currentFileContext}

USER QUERY:
${query}

Provide a thorough, educational response. Reference specific files and line numbers when applicable.`;

    addStep('generating_response');

    // Query Gemini
    const answer = await generateContent(fullPrompt);
    const elapsed = Date.now() - startTime;

    addStep('response_complete', { timeMs: elapsed });

    logger.info(`Query completed`, { timeMs: elapsed, chunksUsed: relevantChunks.length });

    return {
        answer,
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
    const systemPrompt = getSystemPrompt(queryType);

    const contextStr = context.map(c =>
        `File: ${c.path}\n\`\`\`\n${c.content}\n\`\`\``
    ).join('\n\n');

    const fullPrompt = `${systemPrompt}

CODE CONTEXT:
${contextStr || 'No code provided.'}

USER QUERY:
${query}`;

    const answer = await generateContent(fullPrompt);

    return {
        answer,
        sources: [],
        metadata: { mode: 'direct' }
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

    const chunks = vectorStore.getChunks();
    const files = [...new Set(chunks.map(c => c.path))];

    const fileList = files.map(f => `- ${f}`).join('\n');

    const fullPrompt = `${prompts.ARCHITECTURE_PROMPT}

PROJECT FILES:
${fileList}

Generate a Mermaid diagram showing the architecture.`;

    const answer = await generateContent(fullPrompt);

    // Extract mermaid code if wrapped
    const mermaidMatch = answer.match(/```mermaid\n([\s\S]*?)```/);
    const diagram = mermaidMatch ? mermaidMatch[1].trim() : answer;

    return { diagram, files };
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
