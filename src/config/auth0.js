require('dotenv').config();

module.exports = {
    auth0: {
        domain: process.env.AUTH0_DOMAIN,
        audience: process.env.AUTH0_AUDIENCE,
        issuer: process.env.AUTH0_ISSUER,
    },
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
    },
    backends: {
        apiV1: process.env.API_V1_URL || 'http://localhost:3001',
        apiV2: process.env.API_V2_URL || 'http://localhost:3002',
        adminApi: process.env.ADMIN_API_URL || 'http://localhost:3003',
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
    websocket: {
        port: process.env.WS_PORT || 3100,
    },
};
