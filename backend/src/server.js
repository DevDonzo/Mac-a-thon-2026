const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { config, validateConfig } = require('./config');
const { initializeVertexAI, isReady } = require('./vertexai');
const { askWithRAG, askDirect, analyzeCode, suggestRefactor, generateTests, generateArchitecture } = require('./ai');
const vectorStore = require('./vectorStore');
const logger = require('./logger');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path}`, {
            status: res.statusCode,
            duration: `${duration}ms`
        });
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'CodeSensei Backend',
        version: '1.0.0',
        vertexAI: isReady() ? 'connected' : 'not configured',
        index: vectorStore.getStats()
    });
});

// Get index status
app.get('/api/status', (req, res) => {
    res.json({
        ready: isReady(),
        index: vectorStore.getStats()
    });
});

// Index project files
app.post('/api/index', async (req, res) => {
    try {
        const { projectId, files } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        if (!files || !Array.isArray(files)) {
            return res.status(400).json({ error: 'files array is required' });
        }

        logger.info(`Indexing request: ${projectId}`, { fileCount: files.length });

        const result = await vectorStore.indexProject(projectId, files);

        res.json({
            success: result.success,
            message: result.success ? 'Project indexed successfully' : 'Indexing completed with fallback',
            ...result,
            stats: vectorStore.getStats()
        });
    } catch (error) {
        logger.error('Indexing failed', { error: error.message, stack: error.stack });
        res.status(500).json({
            error: 'Indexing failed',
            message: error.message
        });
    }
});

// Main query endpoint
app.post('/api/ask', async (req, res) => {
    try {
        const { prompt, context, queryType = 'general', mentorMode = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        if (!isReady()) {
            return res.status(503).json({
                error: 'Vertex AI not configured',
                message: 'Set GCP_PROJECT_ID in backend/.env and restart the server'
            });
        }

        // Determine if we should use RAG
        const indexStats = vectorStore.getStats();
        const currentFile = context && context[0] ? context[0] : null;

        let result;
        if (indexStats.totalChunks > 0) {
            result = await askWithRAG(prompt, currentFile, { queryType, mentorMode });
        } else {
            result = await askDirect(prompt, context || [], { queryType, mentorMode });
        }

        res.json(result);
    } catch (error) {
        logger.error('Query failed', { error: error.message, stack: error.stack });
        res.status(500).json({
            error: 'Query failed',
            message: error.message
        });
    }
});

// Analyze code
app.post('/api/analyze', async (req, res) => {
    try {
        const { code, filePath } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        if (!isReady()) {
            return res.status(503).json({ error: 'Vertex AI not configured' });
        }

        const result = await analyzeCode(code, filePath);
        res.json(result);
    } catch (error) {
        logger.error('Analysis failed', { error: error.message });
        res.status(500).json({ error: 'Analysis failed', message: error.message });
    }
});

// Refactor suggestions
app.post('/api/refactor', async (req, res) => {
    try {
        const { code, filePath } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        if (!isReady()) {
            return res.status(503).json({ error: 'Vertex AI not configured' });
        }

        const result = await suggestRefactor(code, filePath);
        res.json(result);
    } catch (error) {
        logger.error('Refactor failed', { error: error.message });
        res.status(500).json({ error: 'Refactor failed', message: error.message });
    }
});

// Generate tests
app.post('/api/tests', async (req, res) => {
    try {
        const { code, filePath } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        if (!isReady()) {
            return res.status(503).json({ error: 'Vertex AI not configured' });
        }

        const result = await generateTests(code, filePath);
        res.json(result);
    } catch (error) {
        logger.error('Test generation failed', { error: error.message });
        res.status(500).json({ error: 'Test generation failed', message: error.message });
    }
});

// Generate architecture diagram
app.post('/api/architecture', async (req, res) => {
    try {
        if (!isReady()) {
            return res.status(503).json({ error: 'Vertex AI not configured' });
        }

        const result = await generateArchitecture();
        res.json(result);
    } catch (error) {
        logger.error('Architecture generation failed', { error: error.message });
        res.status(500).json({ error: 'Architecture generation failed', message: error.message });
    }
});

// Clear index
app.post('/api/clear', (req, res) => {
    vectorStore.clear();
    res.json({ success: true, message: 'Index cleared' });
});

// Knowledge Graph / Code DNA endpoint
app.get('/api/knowledge-graph', (req, res) => {
    try {
        const stats = vectorStore.getStats();

        if (stats.totalChunks === 0) {
            return res.json({
                nodes: [],
                edges: [],
                stats: {
                    totalFiles: 0,
                    totalEdges: 0,
                    languages: []
                },
                message: 'No project indexed. Index a project first.'
            });
        }

        const chunks = vectorStore.getChunks();

        // Build file-level nodes
        const fileMap = new Map();
        for (const chunk of chunks) {
            if (!fileMap.has(chunk.path)) {
                fileMap.set(chunk.path, {
                    id: chunk.path,
                    label: chunk.path.split('/').pop(),
                    fullPath: chunk.path,
                    language: chunk.language,
                    chunks: 0,
                    lines: 0,
                    imports: new Set(),
                    exports: new Set(),
                    connections: 0
                });
            }
            const file = fileMap.get(chunk.path);
            file.chunks++;
            file.lines = Math.max(file.lines, chunk.endLine || 0);

            // Extract imports/exports from chunk text
            const importMatches = chunk.text.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]/g) || [];
            const exportMatches = chunk.text.match(/(?:export|module\.exports)/g) || [];

            importMatches.forEach(m => {
                const match = m.match(/['"]([^'"]+)['"]/);
                if (match && match[1].startsWith('.')) {
                    file.imports.add(match[1]);
                }
            });

            if (exportMatches.length > 0) {
                file.exports.add('default');
            }
        }

        // Build edges based on imports
        const edges = [];
        const nodes = [];

        for (const [path, file] of fileMap) {
            // Convert Sets to arrays for JSON
            nodes.push({
                ...file,
                imports: Array.from(file.imports),
                exports: Array.from(file.exports)
            });

            // Create edges for imports
            for (const importPath of file.imports) {
                // Resolve relative import to find target file
                const pathParts = path.split('/');
                pathParts.pop();
                const basePath = pathParts.join('/');

                let resolvedPath = importPath;
                if (importPath.startsWith('./')) {
                    resolvedPath = basePath ? `${basePath}/${importPath.slice(2)}` : importPath.slice(2);
                } else if (importPath.startsWith('../')) {
                    pathParts.pop();
                    resolvedPath = pathParts.join('/') + '/' + importPath.slice(3);
                }

                // Find matching file (with or without extension)
                const targetFile = Array.from(fileMap.keys()).find(p =>
                    p === resolvedPath ||
                    p === resolvedPath + '.js' ||
                    p === resolvedPath + '.ts' ||
                    p === resolvedPath + '.jsx' ||
                    p === resolvedPath + '.tsx' ||
                    p.endsWith('/' + resolvedPath.split('/').pop() + '.js')
                );

                if (targetFile) {
                    edges.push({
                        source: path,
                        target: targetFile,
                        type: 'import'
                    });
                    fileMap.get(path).connections++;
                    fileMap.get(targetFile).connections++;
                }
            }
        }

        // Calculate importance scores
        nodes.forEach(node => {
            node.importance = node.connections + (node.exports.length * 2) + (node.chunks * 0.5);
        });

        res.json({
            nodes,
            edges,
            stats: {
                totalFiles: nodes.length,
                totalEdges: edges.length,
                languages: [...new Set(nodes.map(n => n.language))]
            }
        });
    } catch (error) {
        logger.error('Knowledge graph generation failed', { error: error.message });
        res.status(500).json({ error: 'Failed to generate knowledge graph' });
    }
});

// Live query stream (for RAG visualization)
app.get('/api/query-stream/:queryId', (req, res) => {
    // This would be for Server-Sent Events in a production implementation
    res.json({ message: 'Query streaming endpoint placeholder' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
function start() {
    // Validate configuration
    const configValid = validateConfig();

    // Initialize Vertex AI
    if (configValid) {
        initializeVertexAI();
    }

    const PORT = config.server.port;

    app.listen(PORT, async () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║             CodeSensei Backend - Production Ready             ║
║                                                               ║
║  Status:    ${isReady() ? '✓ READY' : '⚠ LIMITED (Configure GCP_PROJECT_ID)'}                              
║  Port:      ${PORT}                                               
║  Project:   ${config.gcp.projectId || 'Not configured'}
║                                                               ║
║  Endpoints:                                                   ║
║    GET  /health         - Health check                        ║
║    GET  /api/status     - Index status                        ║
║    POST /api/index      - Index project files                 ║
║    POST /api/ask        - RAG-powered queries                 ║
║    POST /api/analyze    - Code analysis                       ║
║    POST /api/refactor   - Refactoring suggestions             ║
║    POST /api/tests      - Generate tests                      ║
║    POST /api/architecture - Architecture diagram              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

        // Startup Auto-Indexing
        if (config.project.autoIndex) {
            const stats = vectorStore.getStats();
            if (stats.totalChunks === 0) {
                console.log('🚀 No cache found. Starting background auto-index...');
                vectorStore.indexLocalDirectory();
            } else {
                console.log(`📦 Loaded ${stats.totalChunks} chunks from Edge Cache (indexed at ${stats.indexedAt})`);
            }

            // Setup File Watcher for Real-time RAG
            const rootPath = path.resolve(__dirname, config.project.root);
            const watcher = chokidar.watch(rootPath, {
                ignored: [/(^|[\/\\])\../, ...config.project.ignorePaths.map(p => `**/${p}/**`)],
                persistent: true,
                ignoreInitial: true
            });

            watcher.on('change', async (filePath) => {
                const relativePath = path.relative(rootPath, filePath);
                console.log(`📝 File changed: ${relativePath}. Re-indexing...`);

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    // We don't have a specific update method yet, so we'll just re-index the whole thing for now
                    // In a production app, we'd only update the specific file's chunks
                    // For the hackathon, a full index of small-med projects is fine
                    await vectorStore.indexLocalDirectory();
                    console.log(`✅ ${relativePath} re-indexed successfully`);
                } catch (e) {
                    logger.error('Failed to update file in vector store', { error: e.message });
                }
            });

            console.log(`👀 Watching for code changes in: ${rootPath}`);
        }
    });
}

start();
module.exports = app;
