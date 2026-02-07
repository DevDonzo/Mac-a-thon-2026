const logger = require('../utils/logger');

// Extract user identity from JWT payload
const extractIdentity = (req, res, next) => {
    if (!req.auth) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'No authentication context found',
        });
    }

    // Extract user information from JWT
    const namespace = 'https://sentinel-gateway.io';

    req.user = {
        id: req.auth.sub,
        email: req.auth[`${namespace}/email`] || req.auth.email,
        tier: req.auth[`${namespace}/tier`] || 'free',
        roles: req.auth[`${namespace}/roles`] || [],
        permissions: req.auth.permissions || [],
    };

    logger.info('User authenticated', {
        userId: req.user.id,
        tier: req.user.tier,
        roles: req.user.roles,
        path: req.path,
    });

    next();
};

module.exports = {
    extractIdentity,
};
