const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { config, validateConfig } = require('./config');
const { initializeVertexAI, isReady } = require('./vertexai');
const { askWithRAG, askDirect, analyzeCode, suggestRefactor, generateTests, generateArchitecture } = require('./ai');
const vectorStore = require('./vectorStore');
const backboard = require('./backboard');
const logger = require('./logger');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

const app = express();

// Indexing status tracking
let indexingStatus = {
    isIndexing: false,
    currentFile: null,
    lastUpdate: null
};

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
    const stats = vectorStore.getStats();
    res.json({
        status: 'ok',
        service: 'CodeSensei Backend',
        version: '1.0.0',
        vertexAI: isReady() ? 'connected' : 'not configured',
        index: stats,
        indexing: indexingStatus,
        workspace: vectorStore.getWorkspacePath() // Include workspace path
    });
});

// Get index status
app.get('/api/status', (req, res) => {
    res.json({
        ready: isReady(),
        stats: vectorStore.getStats(),
        workspace: vectorStore.getWorkspacePath(),
        indexing: indexingStatus
    });
});

// Index project files
app.post('/api/index', async (req, res) => {
    try {
        const { projectId, files, workspacePath } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        indexingStatus.isIndexing = true;
        indexingStatus.currentFile = 'Indexing project...';
        indexingStatus.lastUpdate = new Date().toISOString();

        // If files array is provided, index those files (from VS Code)
        if (files && Array.isArray(files) && files.length > 0) {
            logger.info(`Indexing request: ${projectId}`, { fileCount: files.length });
            
            // Store the workspace path for dashboard re-indexing
            if (workspacePath) {
                vectorStore.setWorkspacePath(workspacePath);
            }

            const result = await vectorStore.indexProject(projectId, files);

            indexingStatus.isIndexing = false;
            indexingStatus.currentFile = null;

            return res.json({
                success: result.success,
                message: result.success ? 'Project indexed successfully' : 'Indexing completed with fallback',
                ...result,
                stats: vectorStore.getStats()
            });
        }

        // If no files provided, re-index the last workspace (from dashboard)
        logger.info(`Re-indexing last workspace for project: ${projectId}`);
        const lastWorkspace = vectorStore.getWorkspacePath();
        
        if (lastWorkspace) {
            // Re-index from the stored workspace path
            const result = await vectorStore.indexWorkspaceDirectory(lastWorkspace);
            
            indexingStatus.isIndexing = false;
            indexingStatus.currentFile = null;
            
            return res.json({
                success: true,
                message: 'Workspace re-indexed successfully',
                stats: vectorStore.getStats(),
                workspacePath: lastWorkspace
            });
        } else {
            // Fallback to local directory if no workspace stored
            await vectorStore.indexLocalDirectory();
            
            indexingStatus.isIndexing = false;
            indexingStatus.currentFile = null;
            
            return res.json({
                success: true,
                message: 'Project auto-indexed successfully',
                stats: vectorStore.getStats()
            });
        }
    } catch (error) {
        indexingStatus.isIndexing = false;
        indexingStatus.currentFile = null;
        logger.error('Indexing failed', { error: error.message, stack: error.stack });
        res.status(500).json({
            error: 'Indexing failed',
            message: error.message
        });
    }
});

// --- AI Analysis Routes ---

app.post('/api/chat/thread', async (req, res) => {
    try {
        if (!config.backboard.enabled) {
            return res.json({ id: 'local-' + Date.now() });
        }
        const threadId = await backboard.createThread();
        res.json({ id: threadId });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// Main query endpoint
app.post('/api/ask', async (req, res) => {
    try {
        const { prompt, context, currentFile, mentorMode, threadId, queryType = 'general', skipRAG = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ status: 'error', message: 'Prompt is required' });
        }

        const indexStats = vectorStore.getStats();
        const activeFile = currentFile || (context && context[0] ? context[0] : null);

        let result;
        
        // If skipRAG is true (e.g., for "Explain Code"), just use direct generation
        if (skipRAG || indexStats.totalChunks === 0) {
            result = await askDirect(prompt, context || [], { queryType, mentorMode });
        } else {
            result = await askWithRAG(prompt, activeFile, {
                queryType,
                mentorMode,
                threadId
            });
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
                symbols: [],
                stats: {
                    totalFiles: 0,
                    totalSymbols: 0,
                    totalEdges: 0,
                    languages: []
                },
                message: 'No project indexed. Index a project first.'
            });
        }

        // Use the enhanced dependency graph method
        const graph = vectorStore.getDependencyGraph();
        
        res.json(graph);
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
                ignored: [
                    /(^|[\/\\])\../, // dots files
                    ...config.project.ignorePaths.map(p => `**/${p}/**`),
                    ...config.project.ignorePaths.map(p => `**/${p}`) // ignore the file itself
                ],
                persistent: true,
                ignoreInitial: true
            });

            watcher.on('change', async (filePath) => {
                const relativePath = path.relative(rootPath, filePath);
                // Check if file is in ignore list again just in case
                if (config.project.ignorePaths.some(p => relativePath.includes(p))) return;

                console.log(`📝 File changed: ${relativePath}. Incrementally updating...`);
                
                indexingStatus.isIndexing = true;
                indexingStatus.currentFile = relativePath;
                indexingStatus.lastUpdate = new Date().toISOString();

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    await vectorStore.updateFile(relativePath, content);
                    console.log(`✅ ${relativePath} updated successfully`);
                } catch (e) {
                    logger.error('Failed to update file in vector store', { error: e.message });
                } finally {
                    indexingStatus.isIndexing = false;
                    indexingStatus.currentFile = null;
                }
            });

            console.log(`👀 Watching for code changes in: ${rootPath}`);
        }
    });
}

start();
module.exports = app;
