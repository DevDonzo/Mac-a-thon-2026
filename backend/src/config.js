require('dotenv').config();
const logger = require('./logger');

const config = {
    gcp: {
        projectId: process.env.GCP_PROJECT_ID,
        location: process.env.GCP_LOCATION || 'us-central1',
    },
    server: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
    },
    models: {
        embedding: 'text-embedding-004',
        generative: 'gemini-2.0-flash-exp',
    },
    rag: {
        chunkSize: 1500,
        chunkOverlap: 200,
        topK: 5,
        minRelevanceScore: 0.3,
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
