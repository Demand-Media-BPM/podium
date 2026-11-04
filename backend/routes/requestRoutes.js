const express = require('express');
const controller = require('../controllers/requestController');
const responseController = require('../controllers/responseController');
const { requireAuth } = require('../middleware/auth');

// Every route here requires a signed-in employee/admin. Ownership is enforced in the service layer.
// State-changing methods are also covered by the trusted-origin (CSRF) check mounted in app.js.
function createRequestRoutes() {
  const router = express.Router();

  // These responses can contain private data or a secret link and must never be cached.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth);

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/summary', controller.summary); // must be declared before '/:id'
  router.get('/:id', controller.getOne);
  router.patch('/:id', controller.update);
  router.post('/:id/regenerate-link', controller.regenerateLink);

  // Responses submitted by clients to this request (read-only for employees in Phase 4).
  router.get('/:id/submissions/:batchId/download', require('../services/submissionService').downloadSubmission);
  router.get('/:id/responses', responseController.list);
  router.get('/:id/responses/:responseId/video', responseController.streamVideo); // development-only playback

  return router;
}

module.exports = createRequestRoutes;
