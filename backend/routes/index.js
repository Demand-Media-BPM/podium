const express = require('express');
const healthRoutes = require('./healthRoutes');
const createAuthRoutes = require('./authRoutes');
const createRequestRoutes = require('./requestRoutes');
const createPublicRoutes = require('./publicRoutes');
const createResponseRoutes = require('./responseRoutes');
const createUserRoutes = require('./userRoutes');

function createRoutes(options = {}) {
  const router = express.Router();

  router.use('/health', healthRoutes);
  router.use('/auth', createAuthRoutes(options));
  router.use('/requests', createRequestRoutes(options));
  router.use('/public', createPublicRoutes(options));
  router.use('/responses', createResponseRoutes(options));
  router.use('/users', createUserRoutes());

  return router;
}

module.exports = createRoutes;
