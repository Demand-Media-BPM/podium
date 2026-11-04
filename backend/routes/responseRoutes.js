const express = require('express');
const controller = require('../controllers/responseController');
const { requireAuth } = require('../middleware/auth');

// Employee access to one response's video, by response id. Both endpoints return a short-lived signed S3 URL
// (never the video itself). Ownership (request owner or admin) is enforced in the service layer.
function createResponseRoutes() {
  const router = express.Router();

  // These responses contain signed URLs: they must never be stored by a browser or a shared cache.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    next();
  });
  router.use(requireAuth);

  router.get('/:id/play', controller.play);
  router.get('/:id/download', controller.download);

  return router;
}

module.exports = createResponseRoutes;
