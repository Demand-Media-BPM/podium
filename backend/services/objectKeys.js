const crypto = require('crypto');

// S3 object keys are always generated here from server-controlled values. The browser never chooses a key or a
// bucket, and every S3 operation re-checks its key against these patterns, so a corrupted database value can
// never make the app read, copy or delete an unrelated object in the bucket.
//
//   pending/<requestId>/<uuid>.<webm|mp4>     the browser uploads here (presigned POST, 5 minutes)
//   responses/<requestId>/<uuid>.<webm|mp4>   verified video, copied here by the server on completion

const PENDING_PREFIX = 'pending/';
const FINAL_PREFIX = 'responses/';
const TAIL = '[0-9a-f]{24}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(webm|mp4)';
const PENDING_KEY = new RegExp(`^${PENDING_PREFIX}${TAIL}$`);
const FINAL_KEY = new RegExp(`^${FINAL_PREFIX}${TAIL}$`);

const EXTENSIONS = { 'video/webm': 'webm', 'video/mp4': 'mp4' };

const isPendingKey = (key) => typeof key === 'string' && PENDING_KEY.test(key);
const isFinalKey = (key) => typeof key === 'string' && FINAL_KEY.test(key);

// New random key for a pending upload of this request.
function newUploadKey(requestId, mimeType) {
  const extension = EXTENSIONS[mimeType];
  if (!extension || !/^[0-9a-f]{24}$/.test(String(requestId))) throw new Error('Invalid object key parts');
  return `${PENDING_PREFIX}${requestId}/${crypto.randomUUID()}.${extension}`;
}

// A brand-new final key (used only by the local-to-S3 migration script, which writes straight to responses/).
function newFinalKey(requestId, mimeType) {
  return finalKeyFor(newUploadKey(requestId, mimeType));
}

// The final key mirrors the pending key under the retention prefix.
function finalKeyFor(uploadKey) {
  if (!isPendingKey(uploadKey)) throw new Error('Not a pending upload key');
  return FINAL_PREFIX + uploadKey.slice(PENDING_PREFIX.length);
}

const extensionOfKey = (key) => (String(key).endsWith('.mp4') ? 'mp4' : 'webm');

module.exports = {
  PENDING_PREFIX,
  FINAL_PREFIX,
  isPendingKey,
  isFinalKey,
  newUploadKey,
  newFinalKey,
  finalKeyFor,
  extensionOfKey,
  EXTENSIONS,
};
