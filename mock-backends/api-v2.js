const express = require('express');
const logger = require('../src/utils/logger');

const app = express();
const PORT = 3002;

app.use(express.json());

app.get('/data', (req, res) => {
    const userId = req.headers['x-user-id'];
    const tier = req.headers['x-user-tier'];

    logger.info('API v2 request', { userId, tier, endpoint: '/data' });

    res.json({
        message: 'API v2 - Premium Tier',
        data: {
            items: ['item1', 'item2', 'item3', 'item4', 'item5'],
            cached: false,
            features: ['basic', 'advanced', 'analytics', 'export'],
            realtime: true,
        },
        tier: 'premium',
        timestamp: new Date().toISOString(),
    });
});

app.get('/stats', (req, res) => {
    res.json({
        message: 'API v2 - Advanced Stats',
        stats: {
            requests: 100,
            users: 50,
            revenue: 10000,
            growth: 15.5,
            breakdown: {
                daily: [120, 150, 180, 200],
                weekly: [800, 900, 1000, 1100],
            },
        },
        tier: 'premium',
    });
});

app.get('/analytics', (req, res) => {
    res.json({
        message: 'API v2 - Premium Analytics',
        analytics: {
            pageViews: 50000,
            uniqueVisitors: 12000,
            conversionRate: 3.5,
            topPages: ['/home', '/products', '/pricing'],
        },
        tier: 'premium',
    });
});

app.listen(PORT, () => {
    console.log(`💎 Mock API v2 (Premium Tier) running on port ${PORT}`);
});
