const { VertexAI } = require('@google-cloud/vertexai');
const { config } = require('./config');
const logger = require('./logger');

let vertexAI = null;
let generativeModel = null;

/**
 * Initialize Vertex AI clients
 */
function initializeVertexAI() {
    if (!config.gcp.projectId) {
        logger.warn('Vertex AI not initialized: missing GCP_PROJECT_ID');
        return false;
    }

    try {
        vertexAI = new VertexAI({
            project: config.gcp.projectId,
            location: config.gcp.location,
        });

        generativeModel = vertexAI.getGenerativeModel({
            model: config.models.generative,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.2,
                topP: 0.8,
                topK: 40,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ],
        });

        logger.info('Vertex AI initialized successfully');
        return true;
    } catch (error) {
        logger.error('Failed to initialize Vertex AI', { error: error.message });
        return false;
    }
}

/**
 * Generate embeddings for text using Vertex AI
 * Uses the generative model to create semantic representations
 */
async function generateEmbeddings(texts) {
    if (!vertexAI) {
        logger.warn('Embeddings unavailable: Vertex AI not initialized');
        return null;
    }

    try {
        // Use the text embedding model
        const embeddingModel = vertexAI.getGenerativeModel({
            model: config.models.embedding,
        });

        const embeddings = [];

        // Process in batches to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            for (const text of batch) {
                try {
                    // Truncate very long texts
                    const truncated = text.slice(0, 8000);
                    const result = await embeddingModel.embedContent(truncated);

                    if (result.embedding && result.embedding.values) {
                        embeddings.push(result.embedding.values);
                    } else {
                        // Fallback: create a simple hash-based pseudo-embedding
                        embeddings.push(createSimpleEmbedding(text));
                    }
                } catch (embErr) {
                    logger.warn('Embedding failed for chunk, using fallback', { error: embErr.message });
                    embeddings.push(createSimpleEmbedding(text));
                }
            }

            // Small delay between batches
            if (i + batchSize < texts.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return embeddings;
    } catch (error) {
        logger.error('Embeddings generation failed', { error: error.message });
        return null;
    }
}

/**
 * Create a simple deterministic embedding as fallback
 * This is NOT semantic but allows the system to function without embeddings API
 */
function createSimpleEmbedding(text, dimensions = 256) {
    const embedding = new Array(dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        for (let j = 0; j < word.length; j++) {
            const idx = (word.charCodeAt(j) * (i + 1) * (j + 1)) % dimensions;
            embedding[idx] += 1 / (1 + Math.log(words.length));
        }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(v => v / magnitude) : embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * Query the generative model
 */
async function generateContent(prompt, options = {}) {
    if (!generativeModel) {
        throw new Error('Vertex AI not initialized. Check your GCP_PROJECT_ID.');
    }

    const { maxRetries = 3, retryDelay = 1000 } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;

            if (response.candidates && response.candidates[0]) {
                return response.candidates[0].content.parts[0].text;
            }

            throw new Error('No response candidates returned');
        } catch (error) {
            logger.warn(`Generation attempt ${attempt} failed`, { error: error.message });

            if (attempt === maxRetries) {
                throw error;
            }

            await new Promise(r => setTimeout(r, retryDelay * attempt));
        }
    }
}

/**
 * Check if Vertex AI is ready
 */
function isReady() {
    return vertexAI !== null && generativeModel !== null;
}

module.exports = {
    initializeVertexAI,
    generateEmbeddings,
    generateContent,
    cosineSimilarity,
    createSimpleEmbedding,
    isReady,
};
