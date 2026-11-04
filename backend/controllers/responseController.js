const { assertDbReady } = require('../config/db');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { getS3Service } = require('../services/s3Service');
const service = require('../services/responseService');
const videoStore = require('../services/videoStore');
const { parsePagination } = require('../services/requestValidation');

// All handlers run behind requireAuth, so req.user is always set. Ownership is enforced in the service layer.

// GET /api/requests/:id/responses
const list = async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  assertDbReady();
  const result = await service.listResponses(req.user, req.params.id, pagination);
  res.status(200).json({ success: true, ...result });
};

// GET /api/requests/:id/responses/:responseId/video
// DEVELOPMENT ONLY (local storage). Phase 5 replaces this with short-lived signed S3 URLs.
// Authenticated and ownership-checked; supports Range requests so the browser can seek.
const streamVideo = async (req, res) => {
  assertDbReady();
  if (config.storage.provider !== 'local') {
    // In S3 mode videos are only reachable through short-lived signed URLs (GET /api/responses/:id/play).
    throw new AppError(404, 'Not found', 'NOT_FOUND');
  }
  const { key, mimeType } = await service.getLocalVideo(req.user, req.params.id, req.params.responseId);
  res.sendFile(
    key,
    {
      root: videoStore.rootDir, // sendFile refuses any path that would leave this root
      dotfiles: 'deny',
      acceptRanges: true,
      cacheControl: false,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': req.query.download === '1' ? 'attachment; filename="response-video"' : 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    },
    (err) => {
      if (!err || res.headersSent) return;
      // A database record without a file (e.g. deleted by hand) is a plain 404.
      res.status(404).json({ success: false, message: 'Video not found', code: 'NOT_FOUND' });
    }
  );
};

// The S3 client is only built when a request really needs S3 (never in local development mode).
const lazyS3 = {
  head: (...args) => getS3Service().head(...args),
  signPlaybackUrl: (...args) => getS3Service().signPlaybackUrl(...args),
  signDownloadUrl: (...args) => getS3Service().signDownloadUrl(...args),
};

// GET /api/responses/:id/play - a short-lived signed S3 URL for the employee's video player.
const play = async (req, res) => {
  assertDbReady();
  const result = await service.getPlayback(req.user, req.params.id, { s3: lazyS3 });
  res.status(200).json({ success: true, ...result });
};

// GET /api/responses/:id/download - a short-lived signed S3 URL that saves the file under a safe generated name.
const download = async (req, res) => {
  assertDbReady();
  const result = await service.getDownload(req.user, req.params.id, { s3: lazyS3 });
  res.status(200).json({ success: true, ...result });
};

module.exports = { list, streamVideo, play, download };
