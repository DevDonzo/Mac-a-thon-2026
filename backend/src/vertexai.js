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
async function generateEmbeddings(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    if (!vertexAI || !config.gcp.projectId) {
        logger.warn('Embeddings unavailable: Vertex AI not initialized');
        return null;
    }

    try {
        const startedAt = Date.now();
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        const accessToken = token.token;

        const embeddingLocation = config.gcp.embeddingLocation || config.gcp.location;
        const url = `https://${embeddingLocation}-aiplatform.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${embeddingLocation}/publishers/google/models/${config.models.embedding}:predict`;

        const embeddings = [];
        const batchSize = 20; // Increased from 5 to 20 for faster indexing
        const totalBatches = Math.ceil(texts.length / batchSize);

        logger.info('Embedding generation started', {
            taskType,
            textCount: texts.length,
            batchSize,
            totalBatches
        });

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const instances = batch.map(text => ({
                content: text.slice(0, 8000),
                task_type: taskType
            }));
            const batchNumber = Math.floor(i / batchSize) + 1;
            const batchStart = Date.now();

            try {
                const response = await axios.post(url, { instances }, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                });

                if (response.data && response.data.predictions) {
                    response.data.predictions.forEach(p => {
                        embeddings.push(p.embeddings.values);
                    });
                    logger.info('Embedding batch complete', {
                        batch: `${batchNumber}/${totalBatches}`,
                        batchSize: batch.length,
                        durationMs: Date.now() - batchStart
                    });
                } else {
                    logger.warn('Batch response missing predictions, using fallback');
                    batch.forEach(text => embeddings.push(createSimpleEmbedding(text)));
                }
            } catch (err) {
                logger.warn('Embedding batch failed, using fallback', { error: err.message });
                batch.forEach(text => embeddings.push(createSimpleEmbedding(text)));
            }

            // Reduced delay from 200ms to 50ms
            if (i + batchSize < texts.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        logger.info('Embedding generation finished', {
            taskType,
            textCount: texts.length,
            embeddingsCount: embeddings.length,
            totalMs: Date.now() - startedAt
        });

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

function extractHttpStatusCode(error) {
    const statusCandidates = [
        error?.status,
        error?.statusCode,
        error?.response?.status,
        error?.cause?.status,
        error?.cause?.statusCode
    ];

    for (const candidate of statusCandidates) {
        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 599) {
            return parsed;
        }
    }

    if (typeof error?.code === 'number' && error.code >= 100 && error.code <= 599) {
        return error.code;
    }

    const message = String(error?.message || '');
    const statusMatch = message.match(/status:\s*(\d{3})/i);
    if (statusMatch) {
        return Number.parseInt(statusMatch[1], 10);
    }

    return null;
}

function isRetryableGenerationError(error, statusCode = null) {
    if (statusCode !== null) {
        if (statusCode >= 500) return true;
        return statusCode === 429 || statusCode === 408 || statusCode === 409;
    }

    if (typeof error?.code === 'number' && error.code > 0 && error.code < 20) {
        return [4, 8, 10, 13, 14].includes(error.code);
    }

    const code = String(error?.code || '').toUpperCase();
    if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
        return true;
    }

    const message = String(error?.message || '').toLowerCase();
    return message.includes('429')
        || message.includes('rate limit')
        || message.includes('quota')
        || message.includes('timeout')
        || message.includes('timed out')
        || message.includes('unavailable')
        || message.includes('resource exhausted');
}

/**
 * Query the generative model
 */
async function generateContent(prompt, options = {}) {
    if (!generativeModel) {
        throw new Error('Vertex AI not initialized. Check your GCP_PROJECT_ID.');
    }

    const { maxRetries = 5, retryDelay = 5000 } = options;
    const maxAttempts = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.floor(maxRetries) : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;

            if (response.candidates && response.candidates[0]) {
                const text = response.candidates[0].content.parts[0].text;
                if (text) return text;
            }

            throw new Error('No valid response text returned from Gemini');
        } catch (error) {
            const statusCode = extractHttpStatusCode(error);
            const retryable = isRetryableGenerationError(error, statusCode);

            if (!retryable) {
                logger.error('Generation failed with non-retryable error', {
                    attempt,
                    statusCode,
                    error: error.message
                });
                throw error;
            }

            if (attempt === maxAttempts) {
                logger.error('Generation retries exhausted', {
                    attempt,
                    maxAttempts,
                    statusCode,
                    error: error.message
                });
                throw error;
            }

            // Exponential backoff with jitter
            const backoff = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
            logger.warn(`Generation attempt ${attempt}/${maxAttempts} failed; retrying`, {
                statusCode,
                retryInMs: Math.round(backoff),
                error: error.message
            });
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
