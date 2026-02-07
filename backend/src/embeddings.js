const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-central1';

const vertexAI = new VertexAI({ project, location });

// Text embedding model for RAG
const embeddingModel = vertexAI.getGenerativeModel({
    model: 'text-embedding-004',
});

// Generative model for responses
const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro-002',
    generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.2,
        topP: 0.8,
    },
});

/**
 * Generate embeddings for text chunks
 */
async function generateEmbeddings(texts) {
    try {
        const embeddings = [];
        for (const text of texts) {
            const result = await embeddingModel.embedContent(text);
            embeddings.push(result.embedding.values);
        }
        return embeddings;
    } catch (error) {
        console.error('Error generating embeddings:', error);
        throw error;
    }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find most relevant chunks for a query
 */
async function findRelevantContext(query, indexedChunks, topK = 5) {
    if (!indexedChunks || indexedChunks.length === 0) {
        return [];
    }

    // Get query embedding
    const [queryEmbedding] = await generateEmbeddings([query]);

    // Calculate similarities
    const scored = indexedChunks.map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Sort by relevance and return top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}

module.exports = {
    generateEmbeddings,
    findRelevantContext,
    generativeModel,
    cosineSimilarity
};
