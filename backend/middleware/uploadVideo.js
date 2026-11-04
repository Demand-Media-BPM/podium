const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const videoStore = require('../services/videoStore');

// Parses the multipart body of POST /api/public/:token/responses: exactly one file field called "video"
// plus a handful of small text fields. The upload is streamed to a randomly named temp file, never into memory,
// and the client's filename is ignored completely.
//
// Every temp file created for a request is removed when the request ends, whatever the outcome. The submission
// service moves the one good file out of the temp directory before that happens.

const MULTIPART_OVERHEAD_BYTES = 64 * 1024; // headers + small text fields around the file

function createTempFileStorage(store) {
  return {
    _handleFile(req, file, cb) {
      const tempPath = path.join(store.tempDir, store.newTempName());
      const out = fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 });
      req.tempUploads.push({ path: tempPath, out });

      let finished = false;
      let settled = false;
      const settle = (err, info) => {
        if (settled) return;
        settled = true;
        cb(err, info);
      };

      file.stream.on('error', (err) => {
        out.destroy();
        settle(err);
      });
      out.on('error', settle);
      out.on('finish', () => {
        finished = true;
      });
      // 'close' (not 'finish') so the file handle is released before the file is moved; matters on Windows.
      out.on('close', () => {
        if (finished) settle(null, { path: tempPath, size: out.bytesWritten });
        else settle(new Error('Upload ended before the file was fully written'));
      });
      file.stream.pipe(out);
    },
    _removeFile(req, file, cb) {
      store.removeTemp(file.path).then(() => cb(null));
    },
  };
}

function translateUploadError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'The video is larger than 2 GiB', 'VIDEO_TOO_LARGE');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError(400, 'Unexpected file field. Upload the recording as "video".', 'VALIDATION_ERROR');
    }
    return new AppError(400, 'The upload is not valid', 'VALIDATION_ERROR');
  }
  // File-system problems (disk full, permissions) are server errors; the generic handler hides the details.
  if (err && err.syscall) return err;
  // Everything else comes from the multipart parser: truncated or malformed bodies, aborted connections.
  return new AppError(400, 'The upload could not be read. Please try again.', 'MALFORMED_UPLOAD');
}

function createVideoUploadMiddleware({ store = videoStore, maxBytes = config.upload.maxBytes } = {}) {
  store.ensureDirsSync();
  const parser = multer({
    storage: createTempFileStorage(store),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 12,
      fieldSize: 2048,
      fieldNameSize: 64,
      parts: 14,
      headerPairs: 40,
    },
    fileFilter: (req, file, cb) => {
      // Only the "video" field may carry a file; anything else is a malformed request.
      cb(null, file.fieldname === 'video');
    },
  }).single('video');

  return function receiveVideoUpload(req, res, next) {
    req.tempUploads = [];
    // Removes every temp file created for this request. Handlers call it before responding, so by the time the
    // client sees an answer nothing is left behind; the 'close' hook below is a safety net for aborted requests.
    req.cleanupUploads = async () => {
      for (const { path: tempPath, out } of req.tempUploads.splice(0)) {
        out.destroy();
        await store.removeTemp(tempPath);
      }
    };
    res.on('close', () => {
      req.cleanupUploads().catch(() => {});
    });

    if (!req.is('multipart/form-data')) {
      return next(new AppError(415, 'Send the response as multipart/form-data', 'UNSUPPORTED_MEDIA_TYPE'));
    }
    // Cheap early rejection when the client announces an oversized body (the hard limit is enforced while streaming).
    const declared = Number(req.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      return next(new AppError(413, 'The video is larger than 2 GiB', 'VIDEO_TOO_LARGE'));
    }

    return parser(req, res, async (err) => {
      if (!err) return next();
      await req.cleanupUploads().catch(() => {}); // a rejected upload leaves nothing on disk before the error is sent
      return next(translateUploadError(err));
    });
  };
}

module.exports = { createVideoUploadMiddleware, translateUploadError };
