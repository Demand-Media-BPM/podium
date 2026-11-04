const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

// TEMPORARY local video storage for development (Phase 4). Phase 5 replaces this with a private S3 bucket,
// so everything that touches the disk is kept in this one module.
//
// Layout inside the upload directory:
//   .tmp/<uuid>.part                 uploads in progress (deleted on every failure path)
//   <requestId>/<uuid>.<webm|mp4>    committed videos
//
// A "key" is the relative path of a committed video. Keys are generated here from server-controlled values only
// and are re-validated against a strict pattern before ever being turned into a filesystem path.

const TEMP_DIR_NAME = '.tmp';
const KEY_PATTERN = /^[0-9a-f]{24}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|mp4)$/;
const TEMP_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part$/;
const STALE_TEMP_MS = 60 * 60 * 1000;

function createVideoStore(rootDir = config.upload.dir) {
  const root = path.resolve(rootDir);
  const tempDir = path.join(root, TEMP_DIR_NAME);

  const insideRoot = (candidate) => candidate.startsWith(root + path.sep);

  // Owner-only permissions where the OS supports them (ignored on Windows).
  function ensureDirsSync() {
    fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
  }

  function newTempName() {
    return `${crypto.randomUUID()}.part`;
  }

  function buildKey(requestId, extension) {
    if (!/^[0-9a-f]{24}$/.test(requestId) || !/^(webm|mp4)$/.test(extension)) {
      throw new Error('Invalid video key parts');
    }
    return `${requestId}/${crypto.randomUUID()}.${extension}`;
  }

  // Returns an absolute path for a valid key, or null. Never trusts a stored key blindly.
  function resolveKey(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return null;
    const resolved = path.resolve(root, key);
    return insideRoot(resolved) ? resolved : null;
  }

  // Only files this store created in its own temp directory can be committed.
  function isTempPath(filePath) {
    const resolved = path.resolve(String(filePath));
    return path.dirname(resolved) === tempDir && TEMP_FILE_PATTERN.test(path.basename(resolved));
  }

  async function commit(tempPath, key) {
    const target = resolveKey(key);
    if (!target || !isTempPath(tempPath)) throw new Error('Refusing to commit an unsafe path');
    await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fsp.rename(tempPath, target); // temp dir is inside the same root, so this is an atomic move
    await fsp.chmod(target, 0o600).catch(() => {});
  }

  async function removeTemp(tempPath) {
    if (!isTempPath(tempPath)) return;
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }

  async function removeKey(key) {
    const target = resolveKey(key);
    if (target) await fsp.rm(target, { force: true }).catch(() => {});
  }

  // Deletes abandoned partial uploads (e.g. the server was killed mid-upload).
  async function removeStaleTemp(maxAgeMs = STALE_TEMP_MS) {
    let removed = 0;
    let names = [];
    try {
      names = await fsp.readdir(tempDir);
    } catch {
      return 0;
    }
    for (const name of names) {
      if (!TEMP_FILE_PATTERN.test(name)) continue;
      const filePath = path.join(tempDir, name);
      try {
        const stat = await fsp.stat(filePath);
        if (Date.now() - stat.mtimeMs > maxAgeMs) {
          await fsp.rm(filePath, { force: true });
          removed += 1;
        }
      } catch {
        // already gone
      }
    }
    return removed;
  }

  return {
    rootDir: root,
    tempDir,
    ensureDirsSync,
    newTempName,
    buildKey,
    resolveKey,
    isTempPath,
    commit,
    removeTemp,
    removeKey,
    removeStaleTemp,
  };
}

const defaultStore = createVideoStore();

module.exports = defaultStore;
module.exports.createVideoStore = createVideoStore;
module.exports.KEY_PATTERN = KEY_PATTERN;
