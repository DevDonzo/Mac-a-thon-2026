const { generateEmbeddings } = require('./embeddings');

// In-memory vector store (for hackathon demo)
// Production would use Vertex AI Vector Search or Pinecone
class VectorStore {
    constructor() {
        this.chunks = [];
        this.projectId = null;
    }

    /**
     * Index a project's files
     */
    async indexProject(projectId, files) {
        console.log(`Indexing project: ${projectId} with ${files.length} files`);
        this.projectId = projectId;
        this.chunks = [];

        // Split files into chunks and generate embeddings
        const allChunks = [];

        for (const file of files) {
            const fileChunks = this.splitIntoChunks(file.path, file.content);
            allChunks.push(...fileChunks);
        }

        // Batch embed all chunks
        const texts = allChunks.map(c => c.text);

        try {
            const embeddings = await generateEmbeddings(texts);

            for (let i = 0; i < allChunks.length; i++) {
                this.chunks.push({
                    ...allChunks[i],
                    embedding: embeddings[i]
                });
            }

            console.log(`Indexed ${this.chunks.length} chunks`);
            return { success: true, chunksIndexed: this.chunks.length };
        } catch (error) {
            console.error('Failed to generate embeddings:', error);
            // Fallback: store chunks without embeddings for basic retrieval
            this.chunks = allChunks.map(c => ({ ...c, embedding: null }));
            return { success: false, chunksIndexed: this.chunks.length, fallback: true };
        }
    }

    /**
     * Split file content into meaningful chunks
     */
    splitIntoChunks(filePath, content, maxChunkSize = 1500) {
        const chunks = [];
        const lines = content.split('\n');

        let currentChunk = [];
        let currentSize = 0;
        let startLine = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineSize = line.length + 1;

            // Check for natural break points (functions, classes)
            const isBreakPoint = /^(function|class|const|let|var|export|import|def |async function)/.test(line.trim());

            if ((currentSize + lineSize > maxChunkSize && currentChunk.length > 0) ||
                (isBreakPoint && currentChunk.length > 5)) {
                chunks.push({
                    path: filePath,
                    startLine: startLine,
                    endLine: i,
                    text: `File: ${filePath}\nLines ${startLine}-${i}:\n${currentChunk.join('\n')}`
                });
                currentChunk = [];
                currentSize = 0;
                startLine = i + 1;
            }

            currentChunk.push(line);
            currentSize += lineSize;
        }

        // Add remaining content
        if (currentChunk.length > 0) {
            chunks.push({
                path: filePath,
                startLine: startLine,
                endLine: lines.length,
                text: `File: ${filePath}\nLines ${startLine}-${lines.length}:\n${currentChunk.join('\n')}`
            });
        }

        return chunks;
    }

    /**
     * Get all indexed chunks (for non-embedding retrieval)
     */
    getAllChunks() {
        return this.chunks;
    }

    /**
     * Simple keyword-based retrieval (fallback when embeddings unavailable)
     */
    keywordSearch(query, topK = 5) {
        const queryTerms = query.toLowerCase().split(/\s+/);

        const scored = this.chunks.map(chunk => {
            const text = chunk.text.toLowerCase();
            let score = 0;
            for (const term of queryTerms) {
                if (text.includes(term)) {
                    score += (text.match(new RegExp(term, 'g')) || []).length;
                }
            }
            return { ...chunk, score };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).filter(c => c.score > 0);
    }

    /**
     * Get stats about the index
     */
    getStats() {
        const fileCount = new Set(this.chunks.map(c => c.path)).size;
        return {
            projectId: this.projectId,
            totalChunks: this.chunks.length,
            filesIndexed: fileCount,
            hasEmbeddings: this.chunks.length > 0 && this.chunks[0].embedding !== null
        };
    }
}

// Singleton instance
const vectorStore = new VectorStore();

module.exports = vectorStore;
