const express = require('express');
const cors = require('cors');
const config = require('./config/auth0');
const logger = require('./utils/logger');
const { checkJwt, handleAuthError } = require('./middleware/auth');
const { extractIdentity } = require('./middleware/identity');
const errorHandler = require('./middleware/error-handler');
const healthRoutes = require('./routes/health');
const proxyRoutes = require('./routes/proxy');

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
    });
    next();
});

app.use('/', healthRoutes);
app.use('/api', checkJwt, handleAuthError, extractIdentity, proxyRoutes);
app.use(errorHandler);

app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist',
        path: req.path,
    });
});

const PORT = config.server.port;
app.listen(PORT, () => {
    logger.info(`🛡️  Sentinel Gateway started`, {
        port: PORT,
        env: config.server.env,
        auth0Domain: config.auth0.domain,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        🛡️  SENTINEL GATEWAY - Identity-Aware API         ║
║                                                           ║
║  Status: RUNNING                                          ║
║  Port: ${PORT}                                              ║
║  Auth0: ${config.auth0.domain}                    ║
║                                                           ║
║  Endpoints:                                               ║
║    GET  /health        - Health check                     ║
║    GET  /ready         - Readiness check                  ║
║    *    /api/*         - Protected API routes             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
