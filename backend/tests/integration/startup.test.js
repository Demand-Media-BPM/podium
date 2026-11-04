require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BACKEND_DIR = path.join(__dirname, '..', '..');

// Starts server.js as a real child process with a controlled environment.
// The environment is built from scratch (NOT inherited), and dotenv never overrides existing variables,
// so the developer's real backend/.env cannot leak into these tests.
function runServer(env, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: BACKEND_DIR,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, AWS_REGION:'', AWS_S3_BUCKET:'', AWS_ACCESS_KEY_ID:'', AWS_SECRET_ACCESS_KEY:'', AWS_S3_ENDPOINT:'', PUBLIC_BASE_URL:'', ...env },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 'timeout', output });
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

const goodEnv = {
  JWT_SECRET: 'x'.repeat(48),
  FRONTEND_URL: 'http://localhost:5173',
  PORT: '5999',
  STORAGE_PROVIDER: 'local', // these tests are about MongoDB/JWT configuration, not storage
};

test('startup fails safely when MONGODB_URI is missing (never starts the server)', async () => {
  const { code, output } = await runServer({ ...goodEnv, MONGODB_URI: '' });
  assert.equal(code, 1);
  assert.match(output, /MONGODB_URI is not set/);
  assert.doesNotMatch(output, /listening on port/);
});

test('startup fails safely when JWT_SECRET is missing or too short', async () => {
  const uri = 'mongodb://127.0.0.1:1/';
  const missing = await runServer({ ...goodEnv, JWT_SECRET: '', MONGODB_URI: uri });
  assert.equal(missing.code, 1);
  assert.match(missing.output, /JWT_SECRET is not set/);

  const short = await runServer({ ...goodEnv, JWT_SECRET: 'short', MONGODB_URI: uri });
  assert.equal(short.code, 1);
  assert.match(short.output, /JWT_SECRET must be at least/);
});

test('startup fails safely for a malformed MONGODB_URI', async () => {
  const { code, output } = await runServer({ ...goodEnv, MONGODB_URI: 'http://not-mongo:secretpw@host/' });
  assert.equal(code, 1);
  assert.match(output, /MONGODB_URI must start with/);
  assert.doesNotMatch(output, /secretpw/);
});

test('S3 mode without AWS settings fails with a clear message (names only) before touching MongoDB', async () => {
  const base = { ...goodEnv, STORAGE_PROVIDER: 's3', MONGODB_URI: 'mongodb://someuser:supersecretpw@127.0.0.1:1/' };
  const missing = await runServer(base);
  assert.equal(missing.code, 1);
  assert.match(missing.output, /AWS_REGION is not set/);
  assert.match(missing.output, /AWS_S3_BUCKET is not set/);
  assert.doesNotMatch(missing.output, /MongoDB connection failed/, 'configuration is validated first');
  assert.doesNotMatch(missing.output, /listening on port/);

  // The default (nothing set) is S3, so a forgotten STORAGE_PROVIDER cannot silently fall back to local files.
  // Blank, not absent: the child process also reads backend/.env, which sets STORAGE_PROVIDER for development.
  const withoutProvider = { ...base, STORAGE_PROVIDER: '' };
  const dflt = await runServer(withoutProvider);
  assert.equal(dflt.code, 1);
  assert.match(dflt.output, /AWS_REGION is not set/);
});

test('half-configured credentials and production local storage are refused', async () => {
  const half = await runServer({
    ...goodEnv, STORAGE_PROVIDER: 's3', AWS_REGION: 'eu-west-1', AWS_S3_BUCKET: 'my-bucket',
    AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', MONGODB_URI: 'mongodb://127.0.0.1:1/',
  });
  assert.equal(half.code, 1);
  assert.match(half.output, /AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together/);
  assert.doesNotMatch(half.output, /AKIAEXAMPLE/, 'credential values are never printed');

  const prod = await runServer({
    ...goodEnv, NODE_ENV: 'production', FRONTEND_URL: 'https://tool.example.com', STORAGE_PROVIDER: 'local',
    MONGODB_URI: 'mongodb://127.0.0.1:1/',
  });
  assert.equal(prod.code, 1);
  assert.match(prod.output, /STORAGE_PROVIDER=local is for development only/);
});

test('startup fails safely when MongoDB is unreachable, without leaking credentials', async () => {
  // Port 1 on localhost refuses connections immediately. serverSelectionTimeoutMS is 10s.
  const { code, output } = await runServer({
    ...goodEnv,
    MONGODB_URI: 'mongodb://someuser:supersecretpw@127.0.0.1:1/',
  });
  assert.equal(code, 1);
  assert.match(output, /Startup failed: MongoDB connection failed/);
  assert.doesNotMatch(output, /listening on port/);
  assert.doesNotMatch(output, /supersecretpw/);
  assert.doesNotMatch(output, /someuser/);
});
