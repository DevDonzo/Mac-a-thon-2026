const express = require('express');
const logger = require('../src/utils/logger');

const app = express();
const PORT = 3001;

app.use(express.json());

app.get('/data', (req, res) => {
    const userId = req.headers['x-user-id'];
    const tier = req.headers['x-user-tier'];

    logger.info('API v1 request', { userId, tier, endpoint: '/data' });

    res.json({
        message: 'API v1 - Free Tier',
        data: {
            items: ['item1', 'item2', 'item3'],
            cached: true,
            features: ['basic'],
        },
        tier: 'free',
        timestamp: new Date().toISOString(),
    });
});

app.get('/stats', (req, res) => {
    res.json({
        message: 'API v1 - Basic Stats',
        stats: {
            requests: 100,
            users: 50,
        },
        tier: 'free',
    });
});

app.listen(PORT, () => {
    console.log(`📦 Mock API v1 (Free Tier) running on port ${PORT}`);
});
