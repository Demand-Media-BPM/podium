// Require this FIRST in every test file. It pins test configuration before config/env.js is loaded,
// so tests never depend on (or leak) the developer's real .env values.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.TRUST_PROXY;
// Phase 4 tests exercise the development-only local storage. S3 tests require ./setupS3Env.js, which switches this.
// The developer's real AWS settings must never be used by tests.
process.env.STORAGE_PROVIDER = 'local';
for (const name of ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_S3_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_PROFILE']) {
  delete process.env[name];
}
process.env.RETENTION_JOB = 'off';
// Tests write videos to a throwaway folder in the OS temp directory, never to the developer's real upload folder.
// The suffix is stable per process so every module in one test file shares the same directory.
const os = require('os');
const path = require('path');
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `vrt-test-uploads-${process.pid}`);
