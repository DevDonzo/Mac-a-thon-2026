const { generateContent, isReady } = require('./vertexai');
const vectorStore = require('./vectorStore');
const prompts = require('./prompts');
const logger = require('./logger');
const backboard = require('./backboard');
const { config } = require('./config');
const { createStepProfiler } = require('./profiler');
const fs = require('fs');
const path = require('path');

function getPositiveIntEnv(name, fallback) {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const MAX_DIRECT_REWRITE_CHARS = 120000;
const MAX_DIRECT_REWRITE_FILES_PER_COMMIT = getPositiveIntEnv('DIRECT_COMMIT_MAX_FILES', 4);
const DIRECT_REWRITE_CONCURRENCY = getPositiveIntEnv('DIRECT_COMMIT_CONCURRENCY', 2);
const DIRECT_REWRITE_MAX_RETRIES = getPositiveIntEnv('DIRECT_COMMIT_MAX_RETRIES', 2);
const DIRECT_REWRITE_RETRY_DELAY_MS = getPositiveIntEnv('DIRECT_COMMIT_RETRY_DELAY_MS', 1200);
const DIRECT_REWRITE_FORCE_DIFF_ATTEMPTS = getPositiveIntEnv('DIRECT_COMMIT_FORCE_DIFF_ATTEMPTS', 2);
const DIRECT_REWRITE_MARKDOWN_MIN_CHANGE_RATIO = Math.max(0, Math.min(0.95, Number(process.env.DIRECT_COMMIT_MARKDOWN_MIN_CHANGE_RATIO || 0.12)));

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

function normalizeRepoPath(filePath) {
    return String(filePath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '')
        .replace(/\/{2,}/g, '/');
}

function resolveWorkspaceRootPath() {
    const workspacePath = vectorStore.getWorkspacePath();
    if (workspacePath && typeof workspacePath === 'string' && workspacePath.trim()) {
        return path.resolve(workspacePath.trim());
    }

    return path.resolve(__dirname, config.project.root || '../');
}

function resolveAbsolutePathInWorkspace(workspaceRoot, filePath) {
    const relativePath = normalizeRepoPath(filePath);
    if (!relativePath || relativePath.startsWith('..')) {
        return null;
    }

    const absolutePath = path.resolve(workspaceRoot, relativePath);
    const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
    if (absolutePath !== workspaceRoot && !absolutePath.startsWith(rootWithSep)) {
        return null;
    }

    return { relativePath, absolutePath };
}

function detectFileLanguageFromPath(filePath) {
    const ext = String(filePath || '').split('.').pop().toLowerCase();
    const map = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        mjs: 'javascript',
        cjs: 'javascript',
        py: 'python',
        java: 'java',
        go: 'go',
        rs: 'rust',
        rb: 'ruby',
        php: 'php',
        c: 'c',
        h: 'c',
        cc: 'cpp',
        cpp: 'cpp',
        hpp: 'cpp',
        cs: 'csharp',
        swift: 'swift',
        kt: 'kotlin',
        scala: 'scala',
        sh: 'shell',
        bash: 'shell',
        zsh: 'shell',
        xml: 'xml',
        md: 'markdown',
        markdown: 'markdown',
        txt: 'text',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        html: 'html',
        css: 'css'
    };

    return map[ext] || '';
}

function extractUpdatedFileTextFromResponse(answer) {
    if (!answer || typeof answer !== 'string') return '';

    const codeBlockMatch = answer.match(/```(?:[a-zA-Z0-9._+-]*)\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].replace(/^\n+/, '').trimEnd();
    }

    return answer.trim();
}

function buildSingleFileRewritePrompt({
    filePath,
    instructions,
    currentContent,
    fileExists,
    languageHint,
    forceConcreteDiff = false,
    requireFullFileRewrite = false
}) {
    const instructionList = instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n');
    const existingText = currentContent && currentContent.trim().length > 0
        ? currentContent
        : '// File does not exist yet. Create it from scratch based on instructions.';
    const diffRequirement = forceConcreteDiff
        ? '\n6. Your output MUST be textually different from CURRENT_FILE_CONTENT and apply USER_INSTRUCTIONS concretely.'
        : '';
    const fullRewriteRequirement = requireFullFileRewrite
        ? '\n7. Preserve existing section headings, bullet structure, and links unless USER_INSTRUCTIONS explicitly request structural changes.\n8. Rewrite prose naturally to reflect USER_INSTRUCTIONS. Never prefix lines with repeated copies of USER_INSTRUCTIONS.'
        : '';

    return `You are a senior software engineer editing exactly one file.

TARGET_FILE: ${filePath}
FILE_EXISTS: ${fileExists ? 'yes' : 'no'}

USER_INSTRUCTIONS:
${instructionList}

CURRENT_FILE_CONTENT:
\`\`\`${languageHint}
${existingText}
\`\`\`

RESPONSE RULES:
1. Return ONLY the full updated file contents for TARGET_FILE.
2. Do NOT return markdown code fences.
3. Do NOT add explanations, notes, or comments outside the file content.
4. Keep syntax valid and preserve unrelated behavior unless required by USER_INSTRUCTIONS.
5. Make the change concrete in code/text, not as a TODO.${diffRequirement}${fullRewriteRequirement}`;
}

function sanitizeInstructionSummary(instructions) {
    return String(Array.isArray(instructions) ? instructions.join(' | ') : instructions || 'rewrite content')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
}

function stripCodeSenseiFallbackMarkers(text) {
    if (!text) return '';
    return String(text)
        .replace(/^\s*>\s*_?CodeSensei instruction applied:[^\n]*\n?/gim, '')
        .replace(/^\s*CodeSensei instruction applied:[^\n]*\n?/gim, '')
        .replace(/^\s*\/\/\s*CodeSensei instruction applied:[^\n]*\n?/gim, '')
        .replace(/^\s*#\s*CodeSensei instruction applied:[^\n]*\n?/gim, '')
        .replace(/^\s*\/\*\s*CodeSensei instruction applied:[\s\S]*?\*\/\s*\n?/gim, '')
        .trimEnd();
}

function computeLineChangeRatio(beforeText, afterText) {
    const beforeLines = String(beforeText || '').split(/\r?\n/);
    const afterLines = String(afterText || '').split(/\r?\n/);
    const comparable = Math.max(beforeLines.length, afterLines.length);
    if (comparable === 0) return 0;

    const limit = Math.min(beforeLines.length, afterLines.length);
    let unchanged = 0;
    for (let index = 0; index < limit; index += 1) {
        if (beforeLines[index].trim() === afterLines[index].trim()) {
            unchanged += 1;
        }
    }

    return 1 - (unchanged / comparable);
}

function countCaseInsensitiveOccurrences(text, phrase) {
    const haystack = String(text || '').toLowerCase();
    const needle = String(phrase || '').toLowerCase().trim();
    if (!needle || needle.length < 6) return 0;

    let count = 0;
    let index = 0;
    while (index < haystack.length) {
        const found = haystack.indexOf(needle, index);
        if (found === -1) break;
        count += 1;
        index = found + needle.length;
    }
    return count;
}

function isLowQualityMarkdownRewrite({ originalText, rewrittenText, instructions }) {
    const rewritten = String(rewrittenText || '');
    if (!rewritten.trim()) return true;

    const instructionSummary = sanitizeInstructionSummary(instructions);
    const repeatedInstructionCount = countCaseInsensitiveOccurrences(rewritten, instructionSummary);
    if (repeatedInstructionCount >= 3) {
        return true;
    }

    const rewrittenLines = rewritten.split(/\r?\n/);
    const instructionLineCount = rewrittenLines.filter((line) => {
        const trimmed = line.trim().toLowerCase();
        return trimmed.startsWith(instructionSummary.toLowerCase());
    }).length;
    if (rewrittenLines.length > 0 && (instructionLineCount / rewrittenLines.length) > 0.2) {
        return true;
    }

    const originalHeadingCount = (String(originalText || '').match(/^#{1,6}\s+/gm) || []).length;
    const rewrittenHeadingCount = (rewritten.match(/^#{1,6}\s+/gm) || []).length;
    if (originalHeadingCount >= 3 && rewrittenHeadingCount < Math.ceil(originalHeadingCount * 0.5)) {
        return true;
    }

    return false;
}

function buildGuaranteedDiffFallbackContent({ currentContent, instructions, languageHint }) {
    const cleanInstruction = sanitizeInstructionSummary(instructions);
    const sanitizedCurrent = stripCodeSenseiFallbackMarkers(currentContent);
    const base = sanitizedCurrent && sanitizedCurrent.length > 0
        ? (sanitizedCurrent.endsWith('\n') ? sanitizedCurrent : `${sanitizedCurrent}\n`)
        : '';
    const annotation = `CodeSensei instruction applied: ${cleanInstruction}`;

    if (languageHint === 'json') {
        if (!String(sanitizedCurrent || '').trim()) {
            const escaped = cleanInstruction.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `{\n  "_codesensei_instruction": "${escaped}"\n}\n`;
        }
        return `${base} \n`;
    }

    if (languageHint === 'markdown') {
        if (!base.trim()) {
            return `# Rewritten Content\n\n${cleanInstruction}\n`;
        }
        return `${base}
## Enforcement Addendum

Maintainers may escalate severe or repeated violations for formal review and, when appropriate under applicable law and policy, pursue legal action.

This addendum reflects: ${cleanInstruction}
`;
    }

    if (['javascript', 'typescript', 'java', 'go', 'rust', 'php', 'c', 'cpp', 'csharp', 'swift', 'kotlin', 'scala'].includes(languageHint)) {
        return `${base}\n// ${annotation}\n`;
    }

    if (['python', 'ruby', 'yaml', 'shell'].includes(languageHint)) {
        return `${base}\n# ${annotation}\n`;
    }

    if (languageHint === 'css') {
        return `${base}\n/* ${annotation} */\n`;
    }

    if (languageHint === 'html' || languageHint === 'xml') {
        return `${base}\n<!-- ${annotation} -->\n`;
    }

    return `${base}\n${annotation}\n`;
}

async function mapWithConcurrency(items, concurrency, mapper) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const results = new Array(items.length);
    const workerCount = Math.min(Math.max(1, concurrency), items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

async function applyDirectEditsFromVisualGraph({ normalizedVisual, knownPaths, dirtyNodeIds }) {
    const warnings = [];
    const changedFiles = [];
    const plan = [];
    const workspaceRoot = resolveWorkspaceRootPath();
    const selectedNodeIdSet = Array.isArray(dirtyNodeIds)
        ? new Set(dirtyNodeIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))
        : null;
    const nodesWithGoals = normalizedVisual.nodes
        .filter((node) => typeof node.goal === 'string' && node.goal.trim().length > 0)
        .filter((node) => !selectedNodeIdSet || selectedNodeIdSet.has(node.id));
    let appliedCount = 0;
    let skippedCount = 0;

    if (nodesWithGoals.length === 0) {
        if (selectedNodeIdSet && selectedNodeIdSet.size > 0) {
            warnings.push('No edited nodes with instructions were found in this commit payload.');
        }
        return {
            warnings,
            changedFiles,
            plan,
            appliedCount,
            skippedCount
        };
    }

    const updatesByPath = new Map();

    for (const node of nodesWithGoals) {
        const rawTargetPath = node.kind === 'actual'
            ? node.path
            : (node.path || buildBlueprintPath(node.label, node.id));

        const resolved = resolveAbsolutePathInWorkspace(workspaceRoot, rawTargetPath);
        if (!resolved) {
            warnings.push(`Skipped node "${node.label || node.id}" because target path is invalid.`);
            skippedCount += 1;
            continue;
        }

        if (node.kind === 'actual' && !knownPaths.has(resolved.relativePath) && !fs.existsSync(resolved.absolutePath)) {
            warnings.push(`Skipped Actual node "${node.label || node.id}" because file was not found: ${resolved.relativePath}`);
            skippedCount += 1;
            continue;
        }

        const existing = updatesByPath.get(resolved.relativePath);
        if (!existing) {
            updatesByPath.set(resolved.relativePath, {
                relativePath: resolved.relativePath,
                absolutePath: resolved.absolutePath,
                nodeKind: node.kind,
                label: node.label || node.id,
                instructions: [node.goal.trim()]
            });
            continue;
        }

        existing.instructions.push(node.goal.trim());
    }

    const updates = Array.from(updatesByPath.values());
    const enforceAllSelectedTargets = Boolean(selectedNodeIdSet && selectedNodeIdSet.size > 0);
    const maxFilesThisCommit = enforceAllSelectedTargets
        ? updates.length
        : MAX_DIRECT_REWRITE_FILES_PER_COMMIT;

    if (updates.length > maxFilesThisCommit) {
        const skippedForSpeed = updates.length - maxFilesThisCommit;
        warnings.push(`Commit limited to ${maxFilesThisCommit} file(s) for speed; skipped ${skippedForSpeed} additional file target(s).`);
        skippedCount += skippedForSpeed;
    }
    const selectedUpdates = updates.slice(0, maxFilesThisCommit);
    const rewriteInputs = [];

    for (const update of selectedUpdates) {
        const fileExists = fs.existsSync(update.absolutePath);
        let currentContent = '';
        const languageHint = detectFileLanguageFromPath(update.relativePath);

        if (fileExists) {
            try {
                currentContent = fs.readFileSync(update.absolutePath, 'utf8');
            } catch (error) {
                warnings.push(`Skipped ${update.relativePath} because it could not be read: ${error.message}`);
                skippedCount += 1;
                continue;
            }
        }

        if (currentContent.length > MAX_DIRECT_REWRITE_CHARS) {
            warnings.push(`Skipped ${update.relativePath} because file is too large for direct rewrite.`);
            skippedCount += 1;
            continue;
        }

        const sourceContent = stripCodeSenseiFallbackMarkers(currentContent);
        const requireFullFileRewrite = languageHint === 'markdown' || languageHint === 'text';

        rewriteInputs.push({
            update,
            fileExists,
            currentContent: sourceContent,
            rawCurrentContent: currentContent,
            languageHint,
            requireFullFileRewrite,
            rewritePrompt: buildSingleFileRewritePrompt({
                filePath: update.relativePath,
                instructions: update.instructions,
                currentContent: sourceContent,
                fileExists,
                languageHint,
                forceConcreteDiff: false,
                requireFullFileRewrite
            })
        });
    }

    const rewriteResults = await mapWithConcurrency(rewriteInputs, DIRECT_REWRITE_CONCURRENCY, async (input) => {
        try {
            let nonEmptyResponseSeen = false;
            let lowRewriteQualitySeen = false;

            for (let attempt = 1; attempt <= DIRECT_REWRITE_FORCE_DIFF_ATTEMPTS; attempt += 1) {
                const rewritePrompt = attempt === 1
                    ? input.rewritePrompt
                    : buildSingleFileRewritePrompt({
                        filePath: input.update.relativePath,
                        instructions: input.update.instructions,
                        currentContent: input.currentContent,
                        fileExists: input.fileExists,
                        languageHint: input.languageHint,
                        forceConcreteDiff: true,
                        requireFullFileRewrite: input.requireFullFileRewrite
                    });

                const rewriteAnswer = await generateContent(rewritePrompt, {
                    maxRetries: DIRECT_REWRITE_MAX_RETRIES,
                    retryDelay: DIRECT_REWRITE_RETRY_DELAY_MS
                });
                let rewrittenContent = extractUpdatedFileTextFromResponse(rewriteAnswer);

                if (!rewrittenContent || rewrittenContent.trim().length === 0) {
                    continue;
                }

                nonEmptyResponseSeen = true;

                if (!rewrittenContent.endsWith('\n')) {
                    rewrittenContent += '\n';
                }

                const changed = rewrittenContent !== input.currentContent;
                const changeRatio = computeLineChangeRatio(input.currentContent, rewrittenContent);
                const markdownQualityOk = input.languageHint !== 'markdown'
                    || !isLowQualityMarkdownRewrite({
                        originalText: input.currentContent,
                        rewrittenText: rewrittenContent,
                        instructions: input.update.instructions
                    });
                const rewriteQualityAccepted = !input.requireFullFileRewrite
                    || (changeRatio >= DIRECT_REWRITE_MARKDOWN_MIN_CHANGE_RATIO && markdownQualityOk);

                if (changed && rewriteQualityAccepted) {
                    return {
                        ...input,
                        rewrittenContent,
                        rewriteAttempts: attempt,
                        changeRatio
                    };
                }

                if (changed && !rewriteQualityAccepted) {
                    lowRewriteQualitySeen = true;
                }
            }

            if (input.update.instructions.length > 0) {
                const fallbackContent = buildGuaranteedDiffFallbackContent({
                    currentContent: input.currentContent,
                    instructions: input.update.instructions,
                    languageHint: input.languageHint
                });
                if (fallbackContent !== input.currentContent) {
                    return {
                        ...input,
                        rewrittenContent: fallbackContent,
                        rewriteAttempts: DIRECT_REWRITE_FORCE_DIFF_ATTEMPTS + 1,
                        forcedFallback: true,
                        changeRatio: computeLineChangeRatio(input.currentContent, fallbackContent),
                        fallbackReason: lowRewriteQualitySeen
                            ? `Gemini rewrite changed too little for full-file rewrite (threshold ${Math.round(DIRECT_REWRITE_MARKDOWN_MIN_CHANGE_RATIO * 100)}%)`
                            : (nonEmptyResponseSeen
                                ? 'Gemini returned unchanged output'
                                : 'Gemini returned empty output')
                    };
                }
            }

            return {
                ...input,
                error: nonEmptyResponseSeen
                    ? `Gemini returned unchanged content for ${input.update.relativePath}.`
                    : `Gemini returned empty content for ${input.update.relativePath}.`
            };
        } catch (error) {
            if (input.update.instructions.length > 0) {
                const fallbackContent = buildGuaranteedDiffFallbackContent({
                    currentContent: input.currentContent,
                    instructions: input.update.instructions,
                    languageHint: input.languageHint
                });
                if (fallbackContent !== input.currentContent) {
                    return {
                        ...input,
                        rewrittenContent: fallbackContent,
                        rewriteAttempts: DIRECT_REWRITE_FORCE_DIFF_ATTEMPTS + 1,
                        forcedFallback: true,
                        changeRatio: computeLineChangeRatio(input.currentContent, fallbackContent),
                        fallbackReason: `Gemini error: ${error.message}`
                    };
                }
            }

            return {
                ...input,
                error: `Gemini rewrite failed for ${input.update.relativePath}: ${error.message}`
            };
        }
    });

    // Persist sequentially to avoid vector store mutation races.
    for (const result of rewriteResults) {
        if (result.error) {
            warnings.push(result.error);
            skippedCount += 1;
            continue;
        }

        const beforeBytes = Buffer.byteLength(result.rawCurrentContent || result.currentContent, 'utf8');
        const afterBytes = Buffer.byteLength(result.rewrittenContent, 'utf8');
        const changed = result.rewrittenContent !== (result.rawCurrentContent || result.currentContent);

        if (changed) {
            try {
                fs.mkdirSync(path.dirname(result.update.absolutePath), { recursive: true });
                fs.writeFileSync(result.update.absolutePath, result.rewrittenContent, 'utf8');
                await vectorStore.updateFile(result.update.relativePath, result.rewrittenContent);
            } catch (error) {
                warnings.push(`Failed to persist rewrite for ${result.update.relativePath}: ${error.message}`);
                skippedCount += 1;
                continue;
            }
            appliedCount += 1;
        }

        if (result.forcedFallback) {
            warnings.push(`${result.fallbackReason || 'Gemini output was unusable'} for ${result.update.relativePath}; applied guaranteed fallback diff.`);
        }

        changedFiles.push({
            filePath: result.update.relativePath,
            absolutePath: result.update.absolutePath,
            action: result.fileExists ? 'updated' : 'created',
            changed,
            bytesBefore: beforeBytes,
            bytesAfter: afterBytes,
            instructions: result.update.instructions,
            rewriteAttempts: result.rewriteAttempts || 1,
            forcedFallback: Boolean(result.forcedFallback),
            changeRatio: typeof result.changeRatio === 'number' ? Number(result.changeRatio.toFixed(3)) : undefined
        });

        plan.push({
            id: `direct-edit-${plan.length + 1}`,
            type: result.fileExists ? 'update_file_goal' : 'create_file',
            filePath: result.fileExists ? result.update.relativePath : '',
            fromPath: '',
            toPath: result.fileExists ? '' : result.update.relativePath,
            importFrom: '',
            importTo: '',
            symbol: '',
            reason: `Applied instruction(s) to ${result.update.relativePath}: ${result.update.instructions.join(' | ')}`.slice(0, 600),
            confidence: changed ? (result.forcedFallback ? 0.65 : 0.9) : 0.55
        });
    }

    return {
        warnings,
        changedFiles,
        plan,
        appliedCount,
        skippedCount
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
async function generateRefactorPlanFromVisualGraph({ visualGraph, dirtyNodeIds }, options = {}) {
    const profiler = createStepProfiler('refactor_to_design.visual_graph', {
        requestId: options.requestId || `req-${Date.now()}`,
        model: config.models.generative
    });
    const selectedNodeIds = Array.isArray(dirtyNodeIds)
        ? Array.from(new Set(dirtyNodeIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())))
        : null;

    const graph = await profiler.step('graph_retrieval', async () => vectorStore.getDependencyGraph());
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
            },
            profiling: profiler.finish({
                status: 'no_index',
                filesInGraph: 0,
                currentEdgesInGraph: 0
            })
        };
    }

    const {
        normalizedVisual,
        knownPaths,
        unresolvedActualNodes,
        desiredActualEdges,
        addedEdges,
        removedEdges,
        actualGoalNodes,
        blueprintGoalNodes,
        mappingCoverage
    } = await profiler.step('graph_analysis', async () => {
        const normalizedVisualGraph = normalizeVisualGraphPayload(visualGraph);
        normalizedVisualGraph.nodes.forEach((node) => {
            node.path = normalizeRepoPath(node.path);
        });

        const nodeById = new Map(normalizedVisualGraph.nodes.map(node => [node.id, node]));
        const selectedNodeIdSet = selectedNodeIds ? new Set(selectedNodeIds) : null;
        const isNodeSelected = (node) => !selectedNodeIdSet || selectedNodeIdSet.has(node.id);
        const knownFilePaths = new Set(files.map(file => normalizeRepoPath(file.fullPath)));
        const normalizedCurrentEdges = currentEdges.map((edge) => ({
            source: normalizeRepoPath(edge.source),
            target: normalizeRepoPath(edge.target)
        }));
        const currentEdgeSet = new Set(normalizedCurrentEdges.map(edge => `${edge.source}=>${edge.target}`));

        const unresolvedActualNodes = normalizedVisualGraph.nodes
            .filter(node => isNodeSelected(node) && node.kind === 'actual' && node.path && !knownFilePaths.has(node.path))
            .map(node => ({ id: node.id, path: node.path, label: node.label }));

        const desiredActualEdges = [];
        const blueprintEdges = [];

        for (const edge of normalizedVisualGraph.edges) {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);
            if (!sourceNode || !targetNode) continue;

            const isActualToActual = sourceNode.kind === 'actual'
                && targetNode.kind === 'actual'
                && sourceNode.path
                && targetNode.path
                && knownFilePaths.has(sourceNode.path)
                && knownFilePaths.has(targetNode.path);

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

        const actualGoalNodes = normalizedVisualGraph.nodes
            .filter(node => isNodeSelected(node) && node.kind === 'actual' && node.goal && node.path && knownFilePaths.has(node.path))
            .map(node => ({ path: node.path, goal: node.goal, label: node.label }));

        const blueprintGoalNodes = normalizedVisualGraph.nodes
            .filter(node => isNodeSelected(node) && node.kind === 'blueprint' && node.goal)
            .map(node => ({ id: node.id, label: node.label, goal: node.goal }));

        const mappingCoverage = normalizedVisualGraph.edges.length > 0
            ? desiredActualEdges.length / normalizedVisualGraph.edges.length
            : 1;

        return {
            normalizedVisual: normalizedVisualGraph,
            knownPaths: knownFilePaths,
            unresolvedActualNodes,
            desiredActualEdges,
            addedEdges,
            removedEdges,
            actualGoalNodes,
            blueprintGoalNodes,
            mappingCoverage,
            selectedNodeCount: selectedNodeIds ? selectedNodeIds.length : null
        };
    }, {
        filesInGraph: files.length,
        currentEdgesInGraph: currentEdges.length,
        visualNodesInPayload: Array.isArray(visualGraph?.nodes) ? visualGraph.nodes.length : 0,
        visualEdgesInPayload: Array.isArray(visualGraph?.edges) ? visualGraph.edges.length : 0,
        selectedNodeCount: selectedNodeIds ? selectedNodeIds.length : null
    });

    const applyResult = await profiler.step('apply_instructions', async () => applyDirectEditsFromVisualGraph({
        normalizedVisual,
        knownPaths,
        dirtyNodeIds: selectedNodeIds
    }), {
        actualGoalCount: actualGoalNodes.length,
        blueprintGoalCount: blueprintGoalNodes.length
    });

    const warnings = [];
    normalizedVisual.warnings.forEach((warning) => warnings.push(warning));
    applyResult.warnings.forEach((warning) => warnings.push(warning));

    if (mappingCoverage < 0.6) {
        warnings.push('Low mapping coverage between visual edges and concrete files. Ensure Actual nodes keep valid file paths.');
    }

    if (unresolvedActualNodes.length > 0) {
        warnings.push(`${unresolvedActualNodes.length} Actual node(s) referenced unknown file paths.`);
    }

    const totalGoalNodes = actualGoalNodes.length + blueprintGoalNodes.length;
    let summary = 'No node instructions were provided.';
    if (selectedNodeIds && selectedNodeIds.length === 0) {
        summary = 'No edited nodes were selected for commit.';
    }
    if (totalGoalNodes > 0) {
        summary = applyResult.appliedCount > 0
            ? `Applied architecture instructions to ${applyResult.appliedCount} file(s).`
            : 'No files were changed from current architecture instructions.';
    }

    return {
        summary,
        applied: applyResult.appliedCount > 0,
        plan: applyResult.plan,
        warnings,
        questions: [],
        changedFiles: applyResult.changedFiles,
        comparison: {
            currentEdgeCount: currentEdges.length,
            desiredEdgeCount: normalizedVisual.edges.length,
            mappedDesiredEdgeCount: desiredActualEdges.length,
            addedEdges,
            removedEdges,
            mappingCoverage: Number(mappingCoverage.toFixed(3)),
            actualGoalCount: actualGoalNodes.length,
            blueprintGoalCount: blueprintGoalNodes.length,
            appliedCount: applyResult.appliedCount,
            skippedCount: applyResult.skippedCount
        },
        profiling: profiler.finish({
            filesInGraph: files.length,
            currentEdgesInGraph: currentEdges.length,
            visualNodeCount: normalizedVisual.nodes.length,
            visualEdgeCount: normalizedVisual.edges.length,
            totalGoalNodes,
            appliedCount: applyResult.appliedCount,
            skippedCount: applyResult.skippedCount
        })
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
