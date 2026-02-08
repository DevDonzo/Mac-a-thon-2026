require('dotenv').config();
const logger = require('./logger');

const config = {
    gcp: {
        projectId: process.env.GCP_PROJECT_ID,
        location: process.env.GCP_LOCATION || 'us-central1',
        embeddingLocation: process.env.GCP_EMBEDDING_LOCATION || process.env.GCP_LOCATION || 'us-central1',
    },
    server: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
    },
    models: {
        embedding: 'text-embedding-004',
        generative: 'gemini-2.0-flash-001',
    },
    rag: {
        chunkSize: 1500,
        chunkOverlap: 200,
        topK: 5,
        minRelevanceScore: 0.3,
    },
    project: {
        root: process.env.PROJECT_ROOT || '../', // Default to parent of backend
        autoIndex: true,
        ignorePaths: ['node_modules', '.git', 'dist', 'build', '.next', 'package-lock.json', 'vector_cache.json', '.DS_Store']
    },
    backboard: {
        apiKey: process.env.BACKBOARD_API_KEY,
        assistantId: process.env.BACKBOARD_ASSISTANT_ID,
        enabled: !!process.env.BACKBOARD_API_KEY
    }
};

function validateConfig() {
    const errors = [];

    if (!config.gcp.projectId) {
        errors.push('GCP_PROJECT_ID is required. Set it in backend/.env');
    }

    if (errors.length > 0) {
        logger.error('Configuration validation failed:');
        errors.forEach(e => logger.error(`  - ${e}`));
        return false;
    }

    logger.info('Configuration validated', {
        project: config.gcp.projectId,
        location: config.gcp.location,
        env: config.server.env
    });

    return true;
}

module.exports = { config, validateConfig };
