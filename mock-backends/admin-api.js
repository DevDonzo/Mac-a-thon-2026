const express = require('express');
const logger = require('../src/utils/logger');

const app = express();
const PORT = 3003;

app.use(express.json());

app.get('/data', (req, res) => {
    const userId = req.headers['x-user-id'];
    const tier = req.headers['x-user-tier'];

    logger.info('Admin API request', { userId, tier, endpoint: '/data' });

    res.json({
        message: 'Admin API - Full Access',
        data: {
            allUsers: 1000,
            systemHealth: 'excellent',
            debugMode: true,
        },
        tier: 'admin',
        timestamp: new Date().toISOString(),
    });
});

app.get('/users', (req, res) => {
    res.json({
        message: 'Admin API - User Management',
        users: [
            { id: 'user1', email: 'alice@free.com', tier: 'free', active: true },
            { id: 'user2', email: 'bob@premium.com', tier: 'premium', active: true },
            { id: 'user3', email: 'admin@sentinel.io', tier: 'admin', active: true },
        ],
        total: 3,
        tier: 'admin',
    });
});

app.get('/system', (req, res) => {
    res.json({
        message: 'Admin API - System Status',
        system: {
            cpu: 45.2,
            memory: 62.8,
            uptime: process.uptime(),
            requests: {
                total: 15000,
                perSecond: 25,
            },
        },
        tier: 'admin',
    });
});

app.post('/config', (req, res) => {
    res.json({
        message: 'Admin API - Configuration Updated',
        config: req.body,
        tier: 'admin',
    });
});

app.listen(PORT, () => {
    console.log(`👑 Mock Admin API running on port ${PORT}`);
});
