const { config } = require('./config');
const { generateEmbeddings, cosineSimilarity, createSimpleEmbedding } = require('./vertexai');
const logger = require('./logger');

class VectorStore {
    constructor() {
        this.chunks = [];
        this.projectId = null;
        this.indexedAt = null;
        this.hasEmbeddings = false;
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

        return {
            success: true,
            chunksIndexed: this.chunks.length,
            filesIndexed: new Set(this.chunks.map(c => c.path)).size,
            timeMs: elapsed
        };
    }

    /**
     * Split file content into meaningful chunks
     */
    splitIntoChunks(filePath, content) {
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
                        language: this.detectLanguage(filePath)
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
                    language: this.detectLanguage(filePath)
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
        const embeddings = await generateEmbeddings([query]);

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

        // Filter and sort
        const filtered = scored
            .filter(c => c.score >= config.rag.minRelevanceScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        logger.debug(`Found ${filtered.length} relevant chunks`, {
            topScore: filtered[0]?.score.toFixed(3),
            query: query.slice(0, 50)
        });

        return filtered;
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
}

// Singleton
const vectorStore = new VectorStore();
module.exports = vectorStore;
