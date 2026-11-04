const express = require('express');
const {
  getQuestion,
  resolveAcceptingRequest,
  createResponse,
  initiate,
  complete,
  requireProvider,
} = require('../controllers/publicController');
const { createPublicRateLimiter, createUploadRateLimiter } = require('../middleware/rateLimiter');
const { createVideoUploadMiddleware } = require('../middleware/uploadVideo');

// Unauthenticated endpoints for clients. There is deliberately no route that lists requests.
function createPublicRoutes({ publicRateLimit, uploadRateLimit, uploadStore, uploadMaxBytes } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  router.use(createPublicRateLimiter(publicRateLimit));

  router.get('/:token', getQuestion);
  router.post('/:token/submissions', createUploadRateLimiter(uploadRateLimit), async (req, res) => {
    const result = await require('../services/submissionService').finalizeSubmission(req.params.token, req.body);
    res.json({success: true, ...result});
  });

  // Production flow (STORAGE_PROVIDER=s3): the browser uploads straight to S3.
  //   1. initiate: rate limit -> check the link -> validate fields -> pending response + presigned POST
  //   2. (browser POSTs the video to S3 using that authorization)
  //   3. complete: rate limit -> link + response id + completion token -> verify in S3 -> submitted
  router.post('/:token/uploads', requireProvider('s3'), createUploadRateLimiter(uploadRateLimit), resolveAcceptingRequest, initiate);
  router.post(
    '/:token/uploads/:responseId/complete',
    requireProvider('s3'),
    createUploadRateLimiter(uploadRateLimit),
    complete
  );

  // DEVELOPMENT ONLY (STORAGE_PROVIDER=local, refused in production): the Phase 4 flow that streams the video through
  // this server into a local folder. Order: rate limit -> check the link -> stream to a temp file -> validate and save.
  router.post(
    '/:token/responses',
    requireProvider('local'),
    createUploadRateLimiter(uploadRateLimit),
    resolveAcceptingRequest,
    createVideoUploadMiddleware({ store: uploadStore, maxBytes: uploadMaxBytes }),
    createResponse
  );

  return router;
}

module.exports = createPublicRoutes;
