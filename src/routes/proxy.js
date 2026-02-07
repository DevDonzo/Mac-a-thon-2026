const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../config/auth0');
const logger = require('../utils/logger');

const router = express.Router();

// Basic proxy route
router.all('*', (req, res, next) => {
    const targetUrl = config.backends.apiV1;

    logger.info('Proxying request', {
        userId: req.user?.id,
        tier: req.user?.tier,
        path: req.path,
        method: req.method,
        target: targetUrl,
    });

    const proxy = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        onProxyReq: (proxyReq, req) => {
            proxyReq.setHeader('X-User-Id', req.user?.id || 'anonymous');
            proxyReq.setHeader('X-User-Tier', req.user?.tier || 'free');
            proxyReq.setHeader('X-Gateway', 'sentinel');
        },
        onProxyRes: (proxyRes, req, res) => {
            logger.info('Proxy response', {
                userId: req.user?.id,
                path: req.path,
                statusCode: proxyRes.statusCode,
            });
        },
        onError: (err, req, res) => {
            logger.error('Proxy error', {
                error: err.message,
                path: req.path,
                userId: req.user?.id,
            });

            res.status(502).json({
                error: 'Bad Gateway',
                message: 'Unable to reach backend service',
            });
        },
    });

    proxy(req, res, next);
});

module.exports = router;
