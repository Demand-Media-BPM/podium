require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../utils/AppError');
const { errorHandler } = require('../../middleware/errorHandler');

function handle(err) {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const originalError = console.error;
  console.error = () => {}; // keep test output clean for expected 5xx logs
  try {
    errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, () => {});
  } finally {
    console.error = originalError;
  }
  return res;
}

test('AppError keeps its status, message and code', () => {
  const res = handle(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { success: false, message: 'Authentication required', code: 'UNAUTHENTICATED' });
});

test('unknown errors become a generic 500 with no internal details', () => {
  const res = handle(new Error('connect ECONNREFUSED mongodb+srv://user:secret@host'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, 'Internal server error');
  assert.ok(!JSON.stringify(res.body).includes('secret'));
});

test('database connectivity errors become a 503', () => {
  const err = new Error('boom');
  err.name = 'MongoServerSelectionError';
  const res = handle(err);
  assert.equal(res.statusCode, 503);
});

test('malformed JSON becomes a 400', () => {
  const err = new SyntaxError('Unexpected token');
  err.type = 'entity.parse.failed';
  assert.equal(handle(err).statusCode, 400);
});
