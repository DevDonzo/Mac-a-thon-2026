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
            - If you cannot find direct evidence in the retrieved context, say so and ask for a file or function name.
            - Do NOT answer from general programming knowledge if the question appears specific to this repo.
            - Do NOT hallucinate code that isn't in the context.`;
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

    const normalizedContext = Array.isArray(context)
        ? context
        : (context ? [{ path: 'conversation', content: String(context) }] : []);

    const contextStr = normalizedContext.map(c =>
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

    // 3. Post-process: sanitize lines that could break Mermaid v11
    const reservedWords = ['style', 'class', 'click', 'callback', 'link', 'linkStyle', 'classDef'];
    diagram = diagram
        .split('\n')
        .filter(line => {
            const trimmed = line.trim();
            // Remove lines that are clearly not Mermaid (LLM commentary)
            if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) return false;
            return true;
        })
        .map(line => {
            // Fix unquoted labels with special chars by wrapping in quotes
            line = line.replace(/\[([^\]]*[():"<>|][^\]]*)\]/g, (_, label) => {
                const clean = label.replace(/[():"<>|]/g, '').trim();
                return `["${clean}"]`;
            });
            // Rename reserved-word node IDs (e.g. style[Style] -> styleNode[Style])
            for (const rw of reservedWords) {
                const re = new RegExp(`\\b${rw}\\[`, 'g');
                line = line.replace(re, `${rw}Node[`);
                const reArrow = new RegExp(`\\b${rw}\\s+(-->|-.->|---|--)`, 'g');
                line = line.replace(reArrow, `${rw}Node $1`);
                const reTarget = new RegExp(`(-->|-.->|---|--)\\s+${rw}\\b`, 'g');
                line = line.replace(reTarget, `$1 ${rw}Node`);
            }
            return line;
        })
        .join('\n')
        .trim();

    return { diagram, files: nodes.map(n => n.fullPath) };
}

function extractJsonFromResponse(answer) {
    if (!answer || typeof answer !== 'string') return null;

    const trimmed = answer.trim();
    if (!trimmed) return null;

    const tryParse = (value) => {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    };

    const direct = tryParse(trimmed);
    if (direct && typeof direct === 'object') return direct;

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
        const fromCodeBlock = tryParse(codeBlockMatch[1].trim());
        if (fromCodeBlock && typeof fromCodeBlock === 'object') return fromCodeBlock;
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const sliced = trimmed.slice(firstBrace, lastBrace + 1);
        const fromSlice = tryParse(sliced);
        if (fromSlice && typeof fromSlice === 'object') return fromSlice;
    }

    return null;
}

function normalizeNodeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/[\\]/g, '/')
        .replace(/[^a-z0-9./_-]/g, '');
}

function stripMermaidShape(labelToken) {
    if (!labelToken || typeof labelToken !== 'string') return '';

    return labelToken
        .trim()
        .replace(/^\[\(/, '')
        .replace(/\)\]$/, '')
        .replace(/^\[\[/, '')
        .replace(/\]\]$/, '')
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^\{\{/, '')
        .replace(/\}\}$/, '')
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .replace(/^\{/, '')
        .replace(/\}$/, '')
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '');
}

function parseMermaidNodeToken(token) {
    if (!token || typeof token !== 'string') return null;

    const cleaned = token
        .trim()
        .replace(/:::[A-Za-z0-9_-]+/g, '')
        .replace(/;$/, '')
        .trim();

    if (!cleaned) return null;

    const nodeMatch = cleaned.match(/^([A-Za-z0-9_.:/-]+)\s*(\[\([^\)]*\)\]|\[[^\]]*\]|\{\{[^}]*\}\}|\([^\)]*\)|\{[^}]*\})?$/);
    if (!nodeMatch) return null;

    return {
        id: nodeMatch[1],
        label: stripMermaidShape(nodeMatch[2] || '')
    };
}

function parseMermaidDesign(mermaidText) {
    const nodeMap = new Map();
    const parsedEdges = [];
    const lines = String(mermaidText || '').split('\n');

    const declarationRegex = /([A-Za-z0-9_.:/-]+)\s*(\[\([^\)]*\)\]|\[[^\]]*\]|\{\{[^}]*\}\}|\([^\)]*\)|\{[^}]*\})/g;
    const edgeRegex = /([A-Za-z0-9_.:/-]+(?:\s*(?:\[\([^\)]*\)\]|\[[^\]]*\]|\{\{[^}]*\}\}|\([^\)]*\)|\{[^}]*\}))?)\s*(-->|==>|-.->|---)\s*([A-Za-z0-9_.:/-]+(?:\s*(?:\[\([^\)]*\)\]|\[[^\]]*\]|\{\{[^}]*\}\}|\([^\)]*\)|\{[^}]*\}))?)/g;

    const upsertNode = (node) => {
        if (!node?.id) return;
        if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, { id: node.id, label: node.label || '' });
            return;
        }
        const existing = nodeMap.get(node.id);
        if (!existing.label && node.label) {
            existing.label = node.label;
        }
    };

    for (const rawLine of lines) {
        const cleaned = rawLine.replace(/%%.*$/, '').trim();
        if (!cleaned || cleaned.startsWith('graph ') || cleaned.startsWith('subgraph ') || cleaned === 'end') {
            continue;
        }

        declarationRegex.lastIndex = 0;
        let declarationMatch;
        while ((declarationMatch = declarationRegex.exec(cleaned)) !== null) {
            upsertNode({
                id: declarationMatch[1],
                label: stripMermaidShape(declarationMatch[2])
            });
        }

        const normalizedEdgeLine = cleaned
            .replace(/--[^-]*-->/g, '-->')
            .replace(/==[^=]*==>/g, '==>')
            .replace(/-\.[^.]*\.->/g, '-.->');

        edgeRegex.lastIndex = 0;
        let edgeMatch;
        while ((edgeMatch = edgeRegex.exec(normalizedEdgeLine)) !== null) {
            const fromToken = parseMermaidNodeToken(edgeMatch[1]);
            const toToken = parseMermaidNodeToken(edgeMatch[3]);
            if (!fromToken || !toToken) continue;

            upsertNode(fromToken);
            upsertNode(toToken);

            parsedEdges.push({
                fromId: fromToken.id,
                fromLabel: fromToken.label || '',
                toId: toToken.id,
                toLabel: toToken.label || '',
                arrow: edgeMatch[2],
                raw: cleaned
            });
        }
    }

    return {
        nodes: Array.from(nodeMap.values()),
        edges: parsedEdges
    };
}

function buildAliasLookup(nodes) {
    const aliasToPaths = new Map();

    const addAlias = (alias, path) => {
        const normalized = normalizeNodeKey(alias);
        if (!normalized) return;
        if (!aliasToPaths.has(normalized)) aliasToPaths.set(normalized, new Set());
        aliasToPaths.get(normalized).add(path);
    };

    for (const node of nodes) {
        const filePath = node.fullPath;
        const baseName = filePath.split('/').pop() || filePath;
        const baseNoExt = baseName.replace(/\.[^.]+$/, '');

        addAlias(filePath, filePath);
        addAlias(baseName, filePath);
        addAlias(baseNoExt, filePath);
        addAlias(node.label, filePath);
        addAlias(filePath.replace(/\.[^.]+$/, ''), filePath);
    }

    return aliasToPaths;
}

function resolvePathFromNode(node, aliasLookup) {
    if (!node) {
        return { resolvedPath: null, reason: 'empty_node' };
    }

    const candidates = [node.id, node.label];

    for (const candidate of candidates) {
        const normalized = normalizeNodeKey(candidate);
        if (!normalized) continue;

        const exact = aliasLookup.get(normalized);
        if (exact?.size === 1) {
            return { resolvedPath: Array.from(exact)[0], reason: 'exact_alias' };
        }
        if (exact?.size > 1) {
            return { resolvedPath: null, reason: `ambiguous_alias:${candidate}` };
        }
    }

    const normalizedCandidates = candidates.map(normalizeNodeKey).filter(Boolean);
    if (normalizedCandidates.length === 0) {
        return { resolvedPath: null, reason: 'no_candidate' };
    }

    const fuzzyMatches = [];
    for (const [alias, paths] of aliasLookup.entries()) {
        for (const candidate of normalizedCandidates) {
            if (alias.includes(candidate) || candidate.includes(alias)) {
                paths.forEach(path => fuzzyMatches.push(path));
            }
        }
    }

    const uniqueFuzzy = [...new Set(fuzzyMatches)];
    if (uniqueFuzzy.length === 1) {
        return { resolvedPath: uniqueFuzzy[0], reason: 'fuzzy_alias' };
    }

    return { resolvedPath: null, reason: uniqueFuzzy.length > 1 ? 'ambiguous_fuzzy' : 'not_found' };
}

function clampConfidence(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0.5;
    if (num < 0) return 0;
    if (num > 1) return 1;
    return Number(num.toFixed(3));
}

function normalizeRefactorPlan(raw, knownPaths) {
    const result = {
        summary: '',
        plan: [],
        warnings: [],
        questions: []
    };

    if (!raw || typeof raw !== 'object') {
        result.warnings.push('Gemini response was not valid JSON.');
        return result;
    }

    if (typeof raw.summary === 'string') {
        result.summary = raw.summary.trim();
    }

    if (Array.isArray(raw.warnings)) {
        raw.warnings.forEach((warning) => {
            if (typeof warning === 'string' && warning.trim()) {
                result.warnings.push(warning.trim());
            }
        });
    }

    if (Array.isArray(raw.questions)) {
        raw.questions.forEach((question) => {
            if (typeof question === 'string' && question.trim()) {
                result.questions.push(question.trim());
            }
        });
    }

    const allowedTypes = new Set([
        'change_import',
        'delete_import',
        'move_file',
        'create_file',
        'create_module',
        'extract_module',
        'rename_symbol',
        'update_file_goal',
        'add_dependency',
        'remove_dependency',
        'manual_review'
    ]);

    if (Array.isArray(raw.plan)) {
        raw.plan.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;

            const normalized = {
                id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `plan-${index + 1}`,
                type: allowedTypes.has(item.type) ? item.type : 'manual_review',
                filePath: typeof item.filePath === 'string' ? item.filePath.trim() : '',
                fromPath: typeof item.fromPath === 'string' ? item.fromPath.trim() : '',
                toPath: typeof item.toPath === 'string' ? item.toPath.trim() : '',
                importFrom: typeof item.importFrom === 'string' ? item.importFrom.trim() : '',
                importTo: typeof item.importTo === 'string' ? item.importTo.trim() : '',
                symbol: typeof item.symbol === 'string' ? item.symbol.trim() : '',
                reason: typeof item.reason === 'string' && item.reason.trim()
                    ? item.reason.trim()
                    : (typeof item.description === 'string' ? item.description.trim() : ''),
                confidence: clampConfidence(item.confidence)
            };

            const allowsNewFilePath = normalized.type === 'create_module' || normalized.type === 'create_file';
            const allowsNewToPath = normalized.type === 'move_file' || normalized.type === 'create_module' || normalized.type === 'create_file';
            const allowsNewImportTo = normalized.type === 'create_module' || normalized.type === 'create_file';

            if (normalized.filePath && !knownPaths.has(normalized.filePath) && !allowsNewFilePath) {
                result.warnings.push(`Plan item ${normalized.id} references unknown filePath: ${normalized.filePath}`);
            }

            if (normalized.fromPath && !knownPaths.has(normalized.fromPath)) {
                result.warnings.push(`Plan item ${normalized.id} references unknown fromPath: ${normalized.fromPath}`);
            }

            if (normalized.toPath && !knownPaths.has(normalized.toPath) && !allowsNewToPath) {
                result.warnings.push(`Plan item ${normalized.id} references unknown toPath: ${normalized.toPath}`);
            }

            if (normalized.importFrom && !knownPaths.has(normalized.importFrom)) {
                result.warnings.push(`Plan item ${normalized.id} references unknown importFrom: ${normalized.importFrom}`);
            }

            if (normalized.importTo && !knownPaths.has(normalized.importTo) && !allowsNewImportTo) {
                result.warnings.push(`Plan item ${normalized.id} references unknown importTo: ${normalized.importTo}`);
            }

            result.plan.push(normalized);
        });
    }

    return result;
}

/**
 * Compare edited Mermaid design against AST graph and produce a refactor plan.
 */
async function generateRefactorPlanFromDesign({ mermaid, originalMermaid = '' }) {
    const graph = vectorStore.getDependencyGraph();
    const files = graph.nodes || [];
    const currentEdges = graph.edges || [];

    if (files.length === 0) {
        return {
            summary: 'No project indexed yet.',
            plan: [],
            warnings: ['Index a project before running architecture sync.'],
            questions: ['Should the backend trigger indexing first?'],
            comparison: {
                currentEdgeCount: 0,
                desiredEdgeCount: 0,
                mappedDesiredEdgeCount: 0,
                addedEdges: [],
                removedEdges: [],
                mappingCoverage: 0
            }
        };
    }

    const parsedDesign = parseMermaidDesign(mermaid);
    const aliasLookup = buildAliasLookup(files);
    const nodeById = new Map(parsedDesign.nodes.map(node => [node.id, node]));
    const unresolvedNodes = [];
    const mappedDesiredEdges = [];

    for (const edge of parsedDesign.edges) {
        const sourceNode = nodeById.get(edge.fromId) || { id: edge.fromId, label: edge.fromLabel || '' };
        const targetNode = nodeById.get(edge.toId) || { id: edge.toId, label: edge.toLabel || '' };

        const sourceResolved = resolvePathFromNode(sourceNode, aliasLookup);
        const targetResolved = resolvePathFromNode(targetNode, aliasLookup);

        if (!sourceResolved.resolvedPath || !targetResolved.resolvedPath) {
            unresolvedNodes.push({
                from: sourceNode,
                to: targetNode,
                sourceReason: sourceResolved.reason,
                targetReason: targetResolved.reason
            });
            continue;
        }

        mappedDesiredEdges.push({
            source: sourceResolved.resolvedPath,
            target: targetResolved.resolvedPath,
            arrow: edge.arrow
        });
    }

    const desiredEdgeSet = new Set(mappedDesiredEdges.map(edge => `${edge.source}=>${edge.target}`));
    const currentEdgeSet = new Set(currentEdges.map(edge => `${edge.source}=>${edge.target}`));

    const addedEdges = [...desiredEdgeSet]
        .filter(key => !currentEdgeSet.has(key))
        .map((key) => {
            const [source, target] = key.split('=>');
            return { source, target };
        });

    const removedEdges = [...currentEdgeSet]
        .filter(key => !desiredEdgeSet.has(key))
        .map((key) => {
            const [source, target] = key.split('=>');
            return { source, target };
        });

    const mappingCoverage = parsedDesign.edges.length > 0
        ? mappedDesiredEdges.length / parsedDesign.edges.length
        : 1;

    const unresolvedPreview = unresolvedNodes.slice(0, 30);
    const fileCatalog = files.map(node => ({
        fullPath: node.fullPath,
        label: node.label,
        language: node.language,
        imports: (node.imports || []).slice(0, 20)
    }));
    const maxFilesForPrompt = 600;
    const maxEdgesForPrompt = 1200;
    const fileCatalogForPrompt = fileCatalog.slice(0, maxFilesForPrompt);
    const currentEdgesForPrompt = currentEdges.slice(0, maxEdgesForPrompt);

    const designPrompt = `You are generating a concrete codebase refactor plan from an edited architecture diagram.

Return JSON only. Do not include markdown fences.

OUTPUT JSON SCHEMA:
{
  "summary": "string",
  "plan": [
    {
      "id": "string",
      "type": "change_import|delete_import|move_file|create_module|rename_symbol|manual_review",
      "filePath": "path/to/file.ext",
      "fromPath": "path/to/file.ext",
      "toPath": "path/to/file.ext",
      "importFrom": "path/to/file.ext",
      "importTo": "path/to/file.ext",
      "symbol": "optional symbol name",
      "reason": "one sentence",
      "confidence": 0.0
    }
  ],
  "warnings": ["string"],
  "questions": ["string"]
}

HARD RULES:
1. Use only file paths that exist in FILE_CATALOG for filePath/fromPath/importFrom/importTo.
2. Keep plan minimal and executable. Avoid speculative rewrites.
3. Prefer change_import or move_file when possible.
4. If mapping ambiguity exists, add a manual_review item and a question.
5. confidence must be between 0 and 1.

FILE_CATALOG:
${JSON.stringify(fileCatalogForPrompt, null, 2)}

CURRENT_AST_EDGES:
${JSON.stringify(currentEdgesForPrompt, null, 2)}

DESIRED_MERMAID:
${mermaid}

OPTIONAL_ORIGINAL_MERMAID:
${originalMermaid || 'N/A'}

DETERMINISTIC_EDGE_DIFF:
${JSON.stringify({
        parsedMermaidEdges: parsedDesign.edges.length,
        mappedDesiredEdges: mappedDesiredEdges.length,
        addedEdges,
        removedEdges,
        unresolvedNodes: unresolvedPreview,
        mappingCoverage: Number(mappingCoverage.toFixed(3))
    }, null, 2)}

Produce the final JSON only.`;

    const llmAnswer = await generateContent(designPrompt);
    const parsedPlan = extractJsonFromResponse(llmAnswer);
    const normalizedPlan = normalizeRefactorPlan(parsedPlan, new Set(files.map(file => file.fullPath)));

    if (normalizedPlan.plan.length === 0 && (addedEdges.length > 0 || removedEdges.length > 0)) {
        addedEdges.slice(0, 12).forEach((edge, index) => {
            normalizedPlan.plan.push({
                id: `auto-add-edge-${index + 1}`,
                type: 'manual_review',
                filePath: edge.source,
                fromPath: '',
                toPath: '',
                importFrom: edge.target,
                importTo: '',
                symbol: '',
                reason: `Design adds dependency ${edge.source} -> ${edge.target}. Choose an import site and symbol.`,
                confidence: 0.4
            });
        });

        removedEdges.slice(0, 12).forEach((edge, index) => {
            normalizedPlan.plan.push({
                id: `auto-remove-edge-${index + 1}`,
                type: 'delete_import',
                filePath: edge.source,
                fromPath: '',
                toPath: '',
                importFrom: edge.target,
                importTo: '',
                symbol: '',
                reason: `Design removes dependency ${edge.source} -> ${edge.target}. Verify and delete unused imports.`,
                confidence: 0.55
            });
        });
    }

    if (!normalizedPlan.summary) {
        normalizedPlan.summary = `Generated ${normalizedPlan.plan.length} candidate change(s) from Mermaid-to-code sync.`;
    }

    if (mappingCoverage < 0.6) {
        normalizedPlan.warnings.push('Low node-to-file mapping coverage. Rename Mermaid nodes closer to real file names for higher precision.');
    }

    if (unresolvedNodes.length > 0) {
        normalizedPlan.warnings.push(`${unresolvedNodes.length} Mermaid edge(s) could not be mapped to concrete files.`);
    }

    if (files.length > fileCatalogForPrompt.length) {
        normalizedPlan.warnings.push(`Prompt context was truncated to ${fileCatalogForPrompt.length} files out of ${files.length}.`);
    }

    if (currentEdges.length > currentEdgesForPrompt.length) {
        normalizedPlan.warnings.push(`Prompt context was truncated to ${currentEdgesForPrompt.length} edges out of ${currentEdges.length}.`);
    }

    return {
        ...normalizedPlan,
        comparison: {
            currentEdgeCount: currentEdges.length,
            desiredEdgeCount: parsedDesign.edges.length,
            mappedDesiredEdgeCount: mappedDesiredEdges.length,
            addedEdges,
            removedEdges,
            mappingCoverage: Number(mappingCoverage.toFixed(3))
        }
    };
}

function normalizeVisualGraphPayload(visualGraph) {
    const warnings = [];
    const nodeMap = new Map();
    const rawNodes = Array.isArray(visualGraph?.nodes) ? visualGraph.nodes : [];
    const rawEdges = Array.isArray(visualGraph?.edges) ? visualGraph.edges : [];

    for (const rawNode of rawNodes) {
        if (!rawNode || typeof rawNode !== 'object') continue;
        const id = typeof rawNode.id === 'string' ? rawNode.id.trim() : '';
        if (!id) continue;

        const data = rawNode.data && typeof rawNode.data === 'object' ? rawNode.data : {};
        const kind = data.kind === 'blueprint' || data.kind === 'draft' ? 'blueprint' : 'actual';
        const path = typeof data.path === 'string' && data.path.trim()
            ? data.path.trim()
            : (kind === 'actual' ? id : '');
        const label = typeof data.label === 'string' && data.label.trim()
            ? data.label.trim()
            : (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : (path.split('/').pop() || id));
        const goal = typeof data.instructions === 'string' && data.instructions.trim()
            ? data.instructions.trim()
            : (typeof data.goal === 'string' ? data.goal.trim() : '');

        nodeMap.set(id, {
            id,
            kind,
            path,
            label,
            goal,
            position: {
                x: Number(rawNode.position?.x) || 0,
                y: Number(rawNode.position?.y) || 0
            }
        });
    }

    const edges = [];
    for (const rawEdge of rawEdges) {
        if (!rawEdge || typeof rawEdge !== 'object') continue;
        const source = typeof rawEdge.source === 'string' ? rawEdge.source.trim() : '';
        const target = typeof rawEdge.target === 'string' ? rawEdge.target.trim() : '';
        if (!source || !target) continue;

        if (!nodeMap.has(source) || !nodeMap.has(target)) {
            warnings.push(`Skipped edge ${source} -> ${target} because one endpoint is missing.`);
            continue;
        }

        const kind = rawEdge.kind
            || (typeof rawEdge.data?.kind === 'string' ? rawEdge.data.kind : '')
            || 'visual';

        edges.push({
            id: typeof rawEdge.id === 'string' && rawEdge.id.trim() ? rawEdge.id.trim() : `${source}->${target}`,
            source,
            target,
            kind,
            label: typeof rawEdge.label === 'string' ? rawEdge.label.trim() : ''
        });
    }

    return {
        nodes: Array.from(nodeMap.values()),
        edges,
        warnings
    };
}

function buildBlueprintPath(label, fallbackId) {
    const base = String(label || fallbackId || 'module')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);

    return `src/${base || 'new-module'}.js`;
}

/**
 * Compare user-modified visual graph against AST graph and produce refactor plan.
 */
async function generateRefactorPlanFromVisualGraph({ visualGraph }) {
    const graph = vectorStore.getDependencyGraph();
    const files = graph.nodes || [];
    const currentEdges = graph.edges || [];

    if (files.length === 0) {
        return {
            summary: 'No project indexed yet.',
            plan: [],
            warnings: ['Index a project before running architecture sync.'],
            questions: ['Should the backend trigger indexing first?'],
            comparison: {
                currentEdgeCount: 0,
                desiredEdgeCount: 0,
                mappedDesiredEdgeCount: 0,
                addedEdges: [],
                removedEdges: [],
                mappingCoverage: 0,
                actualGoalCount: 0,
                blueprintGoalCount: 0
            }
        };
    }

    const normalizedVisual = normalizeVisualGraphPayload(visualGraph);
    const nodeById = new Map(normalizedVisual.nodes.map(node => [node.id, node]));
    const knownPaths = new Set(files.map(file => file.fullPath));
    const currentEdgeSet = new Set(currentEdges.map(edge => `${edge.source}=>${edge.target}`));

    const unresolvedActualNodes = normalizedVisual.nodes
        .filter(node => node.kind === 'actual' && node.path && !knownPaths.has(node.path))
        .map(node => ({ id: node.id, path: node.path, label: node.label }));

    const desiredActualEdges = [];
    const blueprintEdges = [];

    for (const edge of normalizedVisual.edges) {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) continue;

        const isActualToActual = sourceNode.kind === 'actual'
            && targetNode.kind === 'actual'
            && sourceNode.path
            && targetNode.path
            && knownPaths.has(sourceNode.path)
            && knownPaths.has(targetNode.path);

        if (isActualToActual) {
            desiredActualEdges.push({
                source: sourceNode.path,
                target: targetNode.path,
                label: edge.label
            });
            continue;
        }

        blueprintEdges.push({
            sourceId: sourceNode.id,
            sourceKind: sourceNode.kind,
            sourcePath: sourceNode.path,
            sourceLabel: sourceNode.label,
            targetId: targetNode.id,
            targetKind: targetNode.kind,
            targetPath: targetNode.path,
            targetLabel: targetNode.label,
            edgeLabel: edge.label
        });
    }

    const desiredEdgeSet = new Set(desiredActualEdges.map(edge => `${edge.source}=>${edge.target}`));
    const addedEdges = [...desiredEdgeSet]
        .filter(key => !currentEdgeSet.has(key))
        .map((key) => {
            const [source, target] = key.split('=>');
            return { source, target };
        });

    const removedEdges = [...currentEdgeSet]
        .filter(key => !desiredEdgeSet.has(key))
        .map((key) => {
            const [source, target] = key.split('=>');
            return { source, target };
        });

    const actualGoalNodes = normalizedVisual.nodes
        .filter(node => node.kind === 'actual' && node.goal && node.path && knownPaths.has(node.path))
        .map(node => ({ path: node.path, goal: node.goal, label: node.label }));

    const blueprintGoalNodes = normalizedVisual.nodes
        .filter(node => node.kind === 'blueprint' && node.goal)
        .map(node => ({ id: node.id, label: node.label, goal: node.goal }));

    const mappingCoverage = normalizedVisual.edges.length > 0
        ? desiredActualEdges.length / normalizedVisual.edges.length
        : 1;

    const maxFilesForPrompt = 600;
    const maxCurrentEdgesForPrompt = 1200;
    const maxVisualNodesForPrompt = 600;
    const maxVisualEdgesForPrompt = 1200;

    const fileCatalog = files.slice(0, maxFilesForPrompt).map(node => ({
        fullPath: node.fullPath,
        label: node.label,
        language: node.language
    }));

    const currentEdgesForPrompt = currentEdges.slice(0, maxCurrentEdgesForPrompt);
    const visualNodesForPrompt = normalizedVisual.nodes.slice(0, maxVisualNodesForPrompt).map(node => ({
        id: node.id,
        kind: node.kind,
        path: node.path,
        label: node.label,
        goal: node.goal
    }));
    const visualEdgesForPrompt = normalizedVisual.edges.slice(0, maxVisualEdgesForPrompt);

    const systemArchitectPrompt = `You are CodeSensei System Architect. Convert a modified visual graph into a concrete, minimal refactor plan.

Interpretation rules:
1. If user draws arrow Actual(A) -> Actual(B), then A should depend on B. Usually this means add or update import in A referencing B.
2. If an existing Actual(A) -> Actual(B) edge is removed in the visual graph, then dependency should likely be removed (delete import if unused).
3. A goal text inside an Actual node is a direct refactor objective for that existing file.
4. A Blueprint node is a proposed module/component that may not exist in code yet. Propose creating files/modules and rewiring dependencies.
5. If confidence is low or mapping is ambiguous, output manual_review and include clarifying questions.

Output JSON only (no markdown):
{
  "summary": "string",
  "plan": [
    {
      "id": "string",
      "type": "change_import|delete_import|move_file|create_file|create_module|extract_module|rename_symbol|update_file_goal|add_dependency|remove_dependency|manual_review",
      "filePath": "existing/file/path.js",
      "fromPath": "existing/file/path.js",
      "toPath": "new/or/existing/path.js",
      "importFrom": "existing/file/path.js",
      "importTo": "existing/or/new/path.js",
      "symbol": "optional symbol",
      "reason": "single sentence with why",
      "confidence": 0.0
    }
  ],
  "warnings": ["string"],
  "questions": ["string"]
}

Hard constraints:
- For existing-file operations, use only paths present in FILE_CATALOG.
- Keep actions atomic and executable.
- Prefer explicit dependency edits over broad rewrites.
- confidence in [0,1].

FILE_CATALOG:
${JSON.stringify(fileCatalog, null, 2)}

CURRENT_AST_EDGES:
${JSON.stringify(currentEdgesForPrompt, null, 2)}

VISUAL_GRAPH_NODES:
${JSON.stringify(visualNodesForPrompt, null, 2)}

VISUAL_GRAPH_EDGES:
${JSON.stringify(visualEdgesForPrompt, null, 2)}

DETERMINISTIC_DIFF_HINTS:
${JSON.stringify({
        addedEdges,
        removedEdges,
        actualGoalNodes: actualGoalNodes.slice(0, 80),
        blueprintGoalNodes: blueprintGoalNodes.slice(0, 80),
        blueprintEdges: blueprintEdges.slice(0, 120),
        unresolvedActualNodes: unresolvedActualNodes.slice(0, 80),
        mappingCoverage: Number(mappingCoverage.toFixed(3))
    }, null, 2)}

Return final JSON only.`;

    const llmAnswer = await generateContent(systemArchitectPrompt);
    const parsedPlan = extractJsonFromResponse(llmAnswer);
    const normalizedPlan = normalizeRefactorPlan(parsedPlan, knownPaths);

    normalizedVisual.warnings.forEach((warning) => normalizedPlan.warnings.push(warning));

    if (normalizedPlan.plan.length === 0) {
        addedEdges.slice(0, 16).forEach((edge, index) => {
            normalizedPlan.plan.push({
                id: `edge-add-${index + 1}`,
                type: 'change_import',
                filePath: edge.source,
                fromPath: '',
                toPath: '',
                importFrom: edge.target,
                importTo: '',
                symbol: '',
                reason: `User drew a dependency from ${edge.source} to ${edge.target}.`,
                confidence: 0.72
            });
        });

        removedEdges.slice(0, 16).forEach((edge, index) => {
            normalizedPlan.plan.push({
                id: `edge-remove-${index + 1}`,
                type: 'delete_import',
                filePath: edge.source,
                fromPath: '',
                toPath: '',
                importFrom: edge.target,
                importTo: '',
                symbol: '',
                reason: `User removed dependency from ${edge.source} to ${edge.target}.`,
                confidence: 0.7
            });
        });

        actualGoalNodes.slice(0, 16).forEach((goalNode, index) => {
            normalizedPlan.plan.push({
                id: `goal-actual-${index + 1}`,
                type: 'update_file_goal',
                filePath: goalNode.path,
                fromPath: '',
                toPath: '',
                importFrom: '',
                importTo: '',
                symbol: '',
                reason: `Goal for ${goalNode.path}: ${goalNode.goal}`,
                confidence: 0.62
            });
        });

        blueprintGoalNodes.slice(0, 16).forEach((goalNode, index) => {
            normalizedPlan.plan.push({
                id: `goal-blueprint-${index + 1}`,
                type: 'create_module',
                filePath: '',
                fromPath: '',
                toPath: buildBlueprintPath(goalNode.label, goalNode.id),
                importFrom: '',
                importTo: '',
                symbol: '',
                reason: `Create blueprint module "${goalNode.label}" to satisfy goal: ${goalNode.goal}`,
                confidence: 0.58
            });
        });
    }

    if (!normalizedPlan.summary) {
        normalizedPlan.summary = `Generated ${normalizedPlan.plan.length} candidate change(s) from interactive architecture graph.`;
    }

    if (mappingCoverage < 0.6) {
        normalizedPlan.warnings.push('Low mapping coverage between visual edges and concrete files. Ensure Actual nodes keep valid file paths.');
    }

    if (unresolvedActualNodes.length > 0) {
        normalizedPlan.warnings.push(`${unresolvedActualNodes.length} Actual node(s) referenced unknown file paths.`);
    }

    if (files.length > fileCatalog.length) {
        normalizedPlan.warnings.push(`Prompt context truncated to ${fileCatalog.length} files out of ${files.length}.`);
    }

    if (currentEdges.length > currentEdgesForPrompt.length) {
        normalizedPlan.warnings.push(`Prompt context truncated to ${currentEdgesForPrompt.length} edges out of ${currentEdges.length}.`);
    }

    if (normalizedVisual.nodes.length > visualNodesForPrompt.length) {
        normalizedPlan.warnings.push(`Prompt context truncated to ${visualNodesForPrompt.length} visual nodes out of ${normalizedVisual.nodes.length}.`);
    }

    if (normalizedVisual.edges.length > visualEdgesForPrompt.length) {
        normalizedPlan.warnings.push(`Prompt context truncated to ${visualEdgesForPrompt.length} visual edges out of ${normalizedVisual.edges.length}.`);
    }

    return {
        ...normalizedPlan,
        comparison: {
            currentEdgeCount: currentEdges.length,
            desiredEdgeCount: normalizedVisual.edges.length,
            mappedDesiredEdgeCount: desiredActualEdges.length,
            addedEdges,
            removedEdges,
            mappingCoverage: Number(mappingCoverage.toFixed(3)),
            actualGoalCount: actualGoalNodes.length,
            blueprintGoalCount: blueprintGoalNodes.length
        }
    };
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
    generateArchitecture,
    generateRefactorPlanFromDesign,
    generateRefactorPlanFromVisualGraph
};
