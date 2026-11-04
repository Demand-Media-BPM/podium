const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const createRoutes = require('./routes');
const { requireTrustedOrigin } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Factory so tests can build an app with their own options (e.g. a small login rate limit).
function createApp(options = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Only trust X-Forwarded-For when explicitly configured (needed for correct per-IP rate limiting behind nginx).
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }

  // credentials: true lets the browser send/receive the HttpOnly session cookie cross-origin (localhost:5173 -> :5000).
  app.use(cors({ origin: config.trustedOrigins, credentials: true }));
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());

  // CSRF defense: reject state-changing requests that do not come from our own frontend origin.
  app.use('/api', requireTrustedOrigin());
  app.use('/api', createRoutes(options));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
module.exports.createApp = createApp;
