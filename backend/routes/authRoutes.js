const express = require('express');
const { login, me, logout } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { createLoginRateLimiter } = require('../middleware/rateLimiter');

function createAuthRoutes({ loginRateLimit } = {}) {
  const router = express.Router();

  // Responses contain session/user data and must never be cached.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/login', createLoginRateLimiter(loginRateLimit), login);
  router.get('/me', requireAuth, me);
  router.post('/logout', logout);

  return router;
}

module.exports = createAuthRoutes;
