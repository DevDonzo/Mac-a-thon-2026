const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const config = require('../config/auth0');
const logger = require('../utils/logger');

// Auth0 JWT validation middleware
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${config.auth0.domain}/.well-known/jwks.json`,
    }),
    audience: config.auth0.audience,
    issuer: config.auth0.issuer,
    algorithms: ['RS256'],
});

// Error handler for JWT validation
const handleAuthError = (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        logger.warn('Unauthorized request', {
            path: req.path,
            error: err.message,
            ip: req.ip,
        });

        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token',
            code: 'INVALID_TOKEN',
        });
    }
    next(err);
};

module.exports = {
    checkJwt,
    handleAuthError,
};
