require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConfig, findConfigProblems } = require('../../config/env');

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
  JWT_SECRET: 'x'.repeat(40),
  FRONTEND_URL: 'http://localhost:5173',
  STORAGE_PROVIDER: 'local', // storage settings have their own tests below
};
const s3Env = { ...validEnv, STORAGE_PROVIDER: 's3', AWS_REGION: 'eu-west-1', AWS_S3_BUCKET: 'my-video-bucket' };
const problemsFor = (env) => findConfigProblems(buildConfig(env));

test('valid configuration has no problems', () => {
  assert.deepEqual(findConfigProblems(buildConfig(validEnv)), []);
});

test('database name defaults to video_response_tool', () => {
  assert.equal(buildConfig(validEnv).mongodbDbName, 'video_response_tool');
});

test('missing MONGODB_URI and JWT_SECRET are reported by name', () => {
  const problems = findConfigProblems(buildConfig({ FRONTEND_URL: 'http://localhost:5173' }));
  assert.ok(problems.some((p) => p.startsWith('MONGODB_URI')));
  assert.ok(problems.some((p) => p.startsWith('JWT_SECRET')));
});

test('malformed MONGODB_URI is rejected', () => {
  const problems = findConfigProblems(buildConfig({ ...validEnv, MONGODB_URI: 'http://not-mongo' }));
  assert.ok(problems.some((p) => p.includes('MONGODB_URI must start with')));
});

test('short JWT_SECRET is rejected', () => {
  const problems = findConfigProblems(buildConfig({ ...validEnv, JWT_SECRET: 'short' }));
  assert.ok(problems.some((p) => p.includes('JWT_SECRET must be at least')));
});

test('problem messages never contain secret values', () => {
  const env = { ...validEnv, JWT_SECRET: 'tiny-secret-value', MONGODB_URI: 'nope://user:hunter2@host' };
  const text = findConfigProblems(buildConfig(env)).join(' ');
  assert.ok(!text.includes('tiny-secret-value'));
  assert.ok(!text.includes('hunter2'));
});

test('production requires an https frontend URL', () => {
  // Production must use S3, so these cases use the S3 settings; only the FRONTEND_URL scheme differs.
  const problems = findConfigProblems(buildConfig({ ...s3Env, NODE_ENV: 'production' }));
  assert.ok(problems.some((p) => p.includes('https://')));
  assert.deepEqual(
    findConfigProblems(buildConfig({ ...s3Env, NODE_ENV: 'production', FRONTEND_URL: 'https://tool.example.com' })),
    []
  );
});

test('trusted origin is derived from FRONTEND_URL without path or trailing slash', () => {
  assert.deepEqual(buildConfig({ ...validEnv, FRONTEND_URL: 'http://localhost:5173/' }).trustedOrigins, [
    'http://localhost:5173',
  ]);
});

test('invalid FRONTEND_URL is reported', () => {
  const problems = findConfigProblems(buildConfig({ ...validEnv, FRONTEND_URL: 'not a url' }));
  assert.ok(problems.some((p) => p.startsWith('FRONTEND_URL')));
});

test('upload directory defaults outside the frontend and can be overridden', () => {
  const config = buildConfig(validEnv);
  assert.ok(config.upload.dir.endsWith(['backend', 'storage', 'uploads'].join(require('path').sep)));
  assert.equal(config.upload.maxBytes, 2 * 1024 * 1024 * 1024);
  assert.equal(config.upload.retentionDays, 60);
  assert.deepEqual(findConfigProblems(config), []);
});

test('an upload directory inside the frontend (publicly servable) is rejected', () => {
  const frontend = require('path').resolve(__dirname, '..', '..', '..', 'frontend');
  for (const dir of [frontend, require('path').join(frontend, 'public', 'videos'), require('path').join(frontend, 'dist')]) {
    const problems = findConfigProblems(buildConfig({ ...validEnv, UPLOAD_DIR: dir }));
    assert.ok(problems.some((p) => p.startsWith('UPLOAD_DIR')), dir);
  }
});

test('the public link origin is also a trusted origin for submissions', () => {
  const config = buildConfig({ ...validEnv, PUBLIC_BASE_URL: 'https://tool.example.com/' });
  assert.deepEqual(config.trustedOrigins, ['http://localhost:5173', 'https://tool.example.com']);
});

test('storage defaults to S3, so a forgotten setting cannot silently use local files', () => {
  assert.equal(buildConfig({}).storage.provider, 's3');
  const problems = problemsFor({ ...validEnv, STORAGE_PROVIDER: undefined });
  assert.ok(problems.some((p) => p.startsWith('AWS_REGION is not set')));
  assert.ok(problems.some((p) => p.startsWith('AWS_S3_BUCKET is not set')));
});

test('a complete S3 configuration is valid, with or without explicit credentials', () => {
  assert.deepEqual(problemsFor(s3Env), []);
  assert.deepEqual(problemsFor({ ...s3Env, AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret' }), []);
});

test('S3 configuration problems are named, and credential values are never reported', () => {
  assert.ok(problemsFor({ ...s3Env, AWS_REGION: 'mars' }).some((p) => p.startsWith('AWS_REGION is not a valid')));
  assert.ok(problemsFor({ ...s3Env, AWS_S3_BUCKET: 'Bad_Bucket!' }).some((p) => p.startsWith('AWS_S3_BUCKET is not a valid')));
  const half = problemsFor({ ...s3Env, AWS_ACCESS_KEY_ID: 'AKIASECRETVALUE' });
  assert.ok(half.some((p) => p.includes('must be set together')));
  assert.ok(!half.join(' ').includes('AKIASECRETVALUE'));
  assert.ok(problemsFor({ ...validEnv, STORAGE_PROVIDER: 'ftp' }).some((p) => p.startsWith('STORAGE_PROVIDER must be')));
});

test('credentials are never held in the configuration object', () => {
  const config = buildConfig({ ...s3Env, AWS_ACCESS_KEY_ID: 'AKIASECRETVALUE', AWS_SECRET_ACCESS_KEY: 'TOPSECRETVALUE' });
  assert.ok(!JSON.stringify(config).includes('AKIASECRETVALUE'));
  assert.ok(!JSON.stringify(config).includes('TOPSECRETVALUE'));
  assert.equal(config.s3.hasAccessKeyId, true);
});

test('production: local storage and a custom S3 endpoint are refused; S3 is fine', () => {
  const prod = { NODE_ENV: 'production', FRONTEND_URL: 'https://tool.example.com' };
  assert.ok(problemsFor({ ...validEnv, ...prod, STORAGE_PROVIDER: 'local' }).some((p) => p.includes('development only')));
  assert.ok(problemsFor({ ...s3Env, ...prod, AWS_S3_ENDPOINT: 'http://localhost:9000' }).some((p) => p.includes('AWS_S3_ENDPOINT must not be set in production')));
  assert.deepEqual(problemsFor({ ...s3Env, ...prod }), []);
});

test('S3 timings and prefixes match the documented policy', () => {
  const { s3, upload, retention } = buildConfig(s3Env);
  assert.equal(s3.uploadExpiresSeconds, 300);
  assert.equal(s3.playbackExpiresSeconds, 60);
  assert.equal(s3.downloadExpiresSeconds, 60);
  assert.equal(s3.pendingPrefix, 'pending/');
  assert.equal(s3.finalPrefix, 'responses/');
  assert.equal(upload.retentionDays, 60);
  assert.equal(retention.jobEnabled, true);
  assert.equal(buildConfig({ ...s3Env, RETENTION_JOB: 'off' }).retention.jobEnabled, false);
});

test('only the requested variables are checked (admin script does not need JWT_SECRET)', () => {
  const problems = findConfigProblems(buildConfig({ MONGODB_URI: validEnv.MONGODB_URI }), ['MONGODB_URI']);
  assert.deepEqual(problems, []);
});
