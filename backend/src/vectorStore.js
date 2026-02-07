const { config } = require('./config');
const { generateEmbeddings, cosineSimilarity, createSimpleEmbedding } = require('./vertexai');
const logger = require('./logger');
const astParser = require('./astParser');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const CACHE_FILE = path.join(__dirname, '../vector_cache.json');

class VectorStore {
    constructor() {
        this.chunks = [];
        this.projectId = null;
        this.indexedAt = null;
        this.hasEmbeddings = false;
        this.workspacePath = null; // Track VS Code workspace path
        this.load(); // Try to load from cache on startup
    }

    /**
     * Set the workspace path for re-indexing
     */
    setWorkspacePath(path) {
        this.workspacePath = path;
        logger.info('Workspace path set', { path });
    }

    /**
     * Get the current workspace path
     */
    getWorkspacePath() {
        return this.workspacePath;
    }

    /**
     * Index files from a workspace directory path
     */
    async indexWorkspaceDirectory(workspacePath) {
        logger.info(`Indexing workspace directory: ${workspacePath}`);

        try {
            const files = glob.sync('**/*.{js,jsx,ts,tsx,py,md,json}', {
                cwd: workspacePath,
                ignore: config.project.ignorePaths.map(p => `**/${p}/**`),
                nodir: true,
                absolute: false
            });

            const fileData = files.map(f => {
                const fullPath = path.join(workspacePath, f);
                try {
                    return {
                        path: f,
                        content: fs.readFileSync(fullPath, 'utf8')
                    };
                } catch (e) {
                    logger.warn(`Failed to read file: ${f}`, { error: e.message });
                    return null;
                }
            }).filter(f => f !== null);

            const projectName = path.basename(workspacePath);
            return await this.indexProject(projectName, fileData);
        } catch (error) {
            logger.error('Workspace indexing failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Index a project's files
     */
    async indexProject(projectId, files) {
        const startTime = Date.now();
        logger.info(`Starting indexing for project: ${projectId}`, { fileCount: files.length });

        this.projectId = projectId;
        this.chunks = [];
        this.hasEmbeddings = false;

        // Split files into chunks
        const allChunks = [];
        for (const file of files) {
            if (!file.content || file.content.trim().length === 0) continue;

            const fileChunks = this.splitIntoChunks(file.path, file.content);
            allChunks.push(...fileChunks);
        }

        if (allChunks.length === 0) {
            logger.warn('No chunks generated from files');
            return { success: false, chunksIndexed: 0 };
        }

        logger.info(`Generated ${allChunks.length} chunks, generating embeddings...`);

        // Generate embeddings
        const texts = allChunks.map(c => c.text);
        const embeddings = await generateEmbeddings(texts);

        if (embeddings && embeddings.length === allChunks.length) {
            for (let i = 0; i < allChunks.length; i++) {
                this.chunks.push({
                    ...allChunks[i],
                    embedding: embeddings[i],
                    id: `chunk_${i}`
                });
            }
            this.hasEmbeddings = true;
            logger.info('Embeddings generated successfully');
        } else {
            // Fallback: use simple embeddings
            logger.warn('Using fallback embeddings');
            for (let i = 0; i < allChunks.length; i++) {
                this.chunks.push({
                    ...allChunks[i],
                    embedding: createSimpleEmbedding(allChunks[i].text),
                    id: `chunk_${i}`
                });
            }
            this.hasEmbeddings = true; // Still usable, just less accurate
        }

        this.indexedAt = new Date().toISOString();
        const elapsed = Date.now() - startTime;

        logger.info(`Indexing complete`, {
            chunks: this.chunks.length,
            files: new Set(this.chunks.map(c => c.path)).size,
            timeMs: elapsed
        });

        this.save(); // Save to cache

        return {
            success: true,
            chunksIndexed: this.chunks.length,
            filesIndexed: new Set(this.chunks.map(c => c.path)).size,
            timeMs: elapsed
        };
    }

    /**
     * Scan and index local filesystem automatically
     */
    async indexLocalDirectory() {
        const rootPath = path.resolve(__dirname, config.project.root);
        logger.info(`Auto-indexing local directory: ${rootPath}`);

        try {
            const files = glob.sync('**/*.{js,jsx,ts,tsx,py,md,json}', {
                cwd: rootPath,
                ignore: config.project.ignorePaths.map(p => `**/${p}/**`),
                nodir: true
            });

            const fileData = files.map(f => {
                const fullPath = path.join(rootPath, f);
                try {
                    return {
                        path: f,
                        content: fs.readFileSync(fullPath, 'utf8')
                    };
                } catch (e) {
                    return null;
                }
            }).filter(f => f !== null);

            return await this.indexProject('local-project', fileData);
        } catch (error) {
            logger.error('Auto-indexing failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Update a single file in the index
     */
    async updateFile(relativePath, content) {
        if (!content || content.trim().length === 0) {
            // If file is empty or deleted, remove its chunks
            this.chunks = this.chunks.filter(c => c.path !== relativePath);
            this.save();
            return { success: true, removed: true };
        }

        logger.info(`Updating indexed file: ${relativePath}`);

        // 1. Remove old chunks for this file
        this.chunks = this.chunks.filter(c => c.path !== relativePath);

        // 2. Generate new chunks
        const newChunks = this.splitIntoChunks(relativePath, content);
        if (newChunks.length === 0) {
            this.save();
            return { success: true };
        }

        // 3. Generate embeddings for new chunks
        const texts = newChunks.map(c => c.text);
        const embeddings = await generateEmbeddings(texts);

        if (embeddings && embeddings.length === newChunks.length) {
            for (let i = 0; i < newChunks.length; i++) {
                this.chunks.push({
                    ...newChunks[i],
                    embedding: embeddings[i],
                    id: `chunk_${relativePath}_${Date.now()}_${i}`
                });
            }
            this.hasEmbeddings = true;
        } else {
            // Fallback
            for (let i = 0; i < newChunks.length; i++) {
                this.chunks.push({
                    ...newChunks[i],
                    embedding: createSimpleEmbedding(newChunks[i].text),
                    id: `chunk_${relativePath}_${Date.now()}_${i}`
                });
            }
        }

        this.indexedAt = new Date().toISOString();
        this.save();
        return { success: true };
    }

    save() {
        try {
            const data = {
                chunks: this.chunks,
                projectId: this.projectId,
                indexedAt: this.indexedAt,
                hasEmbeddings: this.hasEmbeddings,
                workspacePath: this.workspacePath // Save workspace path!
            };
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
            logger.info('Vector store saved to cache', { workspacePath: this.workspacePath });
        } catch (e) {
            logger.error('Failed to save vector store', { error: e.message });
        }
    }

    load() {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                this.chunks = data.chunks;
                this.projectId = data.projectId;
                this.indexedAt = data.indexedAt;
                this.hasEmbeddings = data.hasEmbeddings;
                this.workspacePath = data.workspacePath || null; // Load workspace path
                logger.info('Vector store loaded from cache', {
                    chunks: this.chunks.length,
                    workspace: this.workspacePath
                });
            }
        } catch (e) {
            logger.error('Failed to load vector store', { error: e.message });
        }
    }

    /**
     * Split file content into meaningful chunks using AST-based parsing
     */
    splitIntoChunks(filePath, content) {
        const language = this.detectLanguage(filePath);

        // Try AST-based chunking first for JavaScript/TypeScript
        const astChunks = astParser.createSymbolBasedChunks(filePath, content, language);

        if (astChunks && astChunks.length > 0) {
            logger.info(`AST-based chunking: ${astChunks.length} chunks for ${filePath}`);
            return astChunks.map(chunk => ({
                ...chunk,
                text: this.formatChunkText(filePath, chunk.startLine, chunk.endLine, chunk.text),
                language,
                symbol: chunk.symbol // Include symbol metadata
            }));
        }

        // Fallback to character-based chunking
        logger.info(`Character-based chunking: ${filePath}`);
        return this.characterBasedChunking(filePath, content, language);
    }

    /**
     * Fallback: Character-based chunking (old method)
     */
    characterBasedChunking(filePath, content, language) {
        const chunks = [];
        const lines = content.split('\n');
        const { chunkSize, chunkOverlap } = config.rag;

        let currentChunk = [];
        let currentSize = 0;
        let startLine = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineSize = line.length + 1;

            // Check for natural break points
            const isBreakPoint = this.isNaturalBreak(line);

            const shouldSplit = (currentSize + lineSize > chunkSize && currentChunk.length > 3) ||
                (isBreakPoint && currentSize > chunkSize / 2);

            if (shouldSplit) {
                const chunkContent = currentChunk.join('\n');
                if (chunkContent.trim().length > 50) {
                    chunks.push({
                        path: filePath,
                        startLine,
                        endLine: i,
                        text: this.formatChunkText(filePath, startLine, i, chunkContent),
                        language
                    });
                }

                // Keep overlap
                const overlapLines = Math.floor(chunkOverlap / 50);
                currentChunk = currentChunk.slice(-overlapLines);
                currentSize = currentChunk.join('\n').length;
                startLine = Math.max(1, i - overlapLines);
            }

            currentChunk.push(line);
            currentSize += lineSize;
        }

        // Add remaining content
        if (currentChunk.length > 0) {
            const chunkContent = currentChunk.join('\n');
            if (chunkContent.trim().length > 50) {
                chunks.push({
                    path: filePath,
                    startLine,
                    endLine: lines.length,
                    text: this.formatChunkText(filePath, startLine, lines.length, chunkContent),
                    language
                });
            }
        }

        return chunks;
    }

    isNaturalBreak(line) {
        const trimmed = line.trim();
        return /^(function|class|const|let|var|export|import|def |async function|public |private |protected )/.test(trimmed) ||
            /^(\/\/|#|\/\*|\*\/)/.test(trimmed) ||
            trimmed === '';
    }

    formatChunkText(path, startLine, endLine, content) {
        return `File: ${path}\nLines ${startLine}-${endLine}:\n\`\`\`\n${content}\n\`\`\``;
    }

    detectLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'java': 'java', 'go': 'go', 'rs': 'rust', 'rb': 'ruby',
            'php': 'php', 'cs': 'csharp', 'cpp': 'cpp', 'c': 'c', 'swift': 'swift',
            'kt': 'kotlin', 'scala': 'scala', 'md': 'markdown', 'json': 'json', 'yaml': 'yaml'
        };
        return langMap[ext] || 'text';
    }

    /**
     * Find relevant chunks using semantic search
     */
    async findRelevant(query, topK = null) {
        topK = topK || config.rag.topK;

        if (this.chunks.length === 0) {
            return [];
        }

        // Get query embedding
        let queryEmbedding;
        const embeddings = await generateEmbeddings([query], 'RETRIEVAL_QUERY');

        if (embeddings && embeddings[0]) {
            queryEmbedding = embeddings[0];
        } else {
            queryEmbedding = createSimpleEmbedding(query);
        }

        // Calculate similarities
        const scored = this.chunks.map(chunk => ({
            ...chunk,
            score: cosineSimilarity(queryEmbedding, chunk.embedding)
        }));

        // Filter
        const filtered = scored
            .filter(c => c.score >= config.rag.minRelevanceScore)
            .sort((a, b) => b.score - a.score);

        // Hybrid Search: If semantic results are few or low score, supplement with keyword search
        if (filtered.length < 3 || (filtered[0]?.score < 0.6)) {
            const keywordResults = this.keywordSearch(query, 5);

            // Add unique keyword results to the list
            for (const kwResult of keywordResults) {
                if (!filtered.some(f => f.id === kwResult.id)) {
                    // Give keyword matches a decent score to pass filtering if they match well
                    kwResult.score = Math.max(kwResult.score, 0.5);
                    filtered.push(kwResult);
                }
            }

            // Re-sort
            filtered.sort((a, b) => b.score - a.score);
        }

        const finalResults = filtered.slice(0, topK);

        logger.info(`Found ${finalResults.length} relevant chunks (Semantic + Keyword)`, {
            topScore: finalResults[0]?.score.toFixed(3),
            query: query.slice(0, 50)
        });

        return finalResults;
    }

    /**
     * Keyword-based search fallback
     */
    keywordSearch(query, topK = 5) {
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

        const scored = this.chunks.map(chunk => {
            const text = chunk.text.toLowerCase();
            let score = 0;

            for (const term of queryTerms) {
                const matches = (text.match(new RegExp(term, 'g')) || []).length;
                score += matches;
            }

            return { ...chunk, score: score / queryTerms.length };
        });

        return scored
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    getStats() {
        const uniqueFiles = new Set(this.chunks.map(c => c.path));
        return {
            projectId: this.projectId,
            totalChunks: this.chunks.length,
            filesIndexed: uniqueFiles.size,
            hasEmbeddings: this.hasEmbeddings,
            indexedAt: this.indexedAt,
            languages: [...new Set(this.chunks.map(c => c.language))]
        };
    }

    getChunks() {
        return this.chunks;
    }

    clear() {
        this.chunks = [];
        this.projectId = null;
        this.indexedAt = null;
        this.hasEmbeddings = false;
    }
    getDependencyGraph() {
        const chunks = this.chunks;
        const fileMap = new Map();
        const symbolMap = new Map(); // NEW: Track symbols

        // 1. Build file nodes and symbol nodes from chunks
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
                    symbols: [], // NEW: List of symbols in this file
                    connections: 0
                });
            }
            const file = fileMap.get(chunk.path);
            file.chunks++;
            file.lines = Math.max(file.lines, chunk.endLine || 0);

            // NEW: If chunk has symbol metadata, add to symbol map
            if (chunk.symbol) {
                const symbolId = `${chunk.path}::${chunk.symbol.name}`;
                symbolMap.set(symbolId, {
                    id: symbolId,
                    type: chunk.symbol.type,
                    name: chunk.symbol.name,
                    file: chunk.path,
                    line: chunk.startLine
                });
                file.symbols.push(chunk.symbol);
            }

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

        // 2. Build edges based on imports
        const edges = [];
        const nodes = [];

        for (const [path, file] of fileMap) {
            // Convert Sets to arrays for JSON
            nodes.push({
                ...file,
                imports: Array.from(file.imports),
                exports: Array.from(file.exports),
                symbolCount: file.symbols.length
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

        // 3. Calculate importance scores
        nodes.forEach(node => {
            node.importance = node.connections + (node.exports.length * 2) + (node.chunks * 0.5) + (node.symbolCount * 0.3);
        });

        // 4. Add symbol nodes for richer visualization
        const symbolNodes = Array.from(symbolMap.values());

        return {
            nodes,
            edges,
            symbols: symbolNodes, // NEW: Include symbol-level nodes
            stats: {
                totalFiles: nodes.length,
                totalSymbols: symbolNodes.length,
                totalEdges: edges.length
            }
        };
    }
}

// Singleton
const vectorStore = new VectorStore();
module.exports = vectorStore;
