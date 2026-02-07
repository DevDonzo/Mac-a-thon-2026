const express = require('express');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'sentinel-gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Readiness check
router.get('/ready', (req, res) => {
    res.json({
        status: 'ready',
        checks: {
            auth0: 'ok',
        },
    });
});

module.exports = router;
