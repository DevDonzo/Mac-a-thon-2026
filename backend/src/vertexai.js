const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
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
    if (!vertexAI || !config.gcp.projectId) {
        logger.warn('Embeddings unavailable: Vertex AI not initialized');
        return null;
    }

    try {
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        const accessToken = token.token;

        const url = `https://${config.gcp.location}-aiplatform.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${config.gcp.location}/publishers/google/models/${config.models.embedding}:predict`;

        const embeddings = [];
        const batchSize = 5;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const instances = batch.map(text => ({
                content: text.slice(0, 8000),
                task_type: 'RETRIEVAL_DOCUMENT'
            }));

            try {
                const response = await axios.post(url, { instances }, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data && response.data.predictions) {
                    response.data.predictions.forEach(p => {
                        embeddings.push(p.embeddings.values);
                    });
                } else {
                    logger.warn('Batch response missing predictions, using fallback');
                    batch.forEach(text => embeddings.push(createSimpleEmbedding(text)));
                }
            } catch (err) {
                logger.warn('Embedding batch failed, using fallback', { error: err.message });
                batch.forEach(text => embeddings.push(createSimpleEmbedding(text)));
            }

            // Small delay between batches to avoid hits on quota
            if (i + batchSize < texts.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return embeddings;
    } catch (error) {
        logger.error('Embeddings generation failed fatally', { error: error.message });
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

    const { maxRetries = 5, retryDelay = 5000 } = options;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;

            if (response.candidates && response.candidates[0]) {
                const text = response.candidates[0].content.parts[0].text;
                if (text) return text;
            }

            throw new Error('No valid response text returned from Gemini');
        } catch (error) {
            lastError = error;
            const isRateLimit = error.message.includes('429') || error.message.includes('Quota');

            if (isRateLimit) {
                logger.warn(`Rate limit hit (429), attempt ${attempt}/${maxRetries}. Retrying in ${retryDelay * attempt}ms...`);
            } else {
                logger.warn(`Generation attempt ${attempt} failed`, { error: error.message });
            }

            if (attempt === maxRetries) {
                throw error;
            }

            // Exponential backoff with jitter
            const backoff = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
            await new Promise(r => setTimeout(r, backoff));
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
