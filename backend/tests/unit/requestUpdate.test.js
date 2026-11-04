require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUpdateInput, parsePagination } = require('../../services/requestValidation');
const { isValidObjectIdString, assertValidId } = require('../../utils/ids');

const NOW = new Date('2026-06-01T12:00:00Z');

const detailsOf = (fn) => {
  try { fn(); } catch (err) { return { status: err.statusCode, details: err.details, code: err.code }; }
  return null;
};

test('update: only whitelisted fields; protected fields rejected', () => {
  const ok = validateUpdateInput({ title: 'New', question: 'Q?', status: 'closed' }, NOW);
  assert.deepEqual(ok.set, { title: 'New', question: 'Q?', status: 'closed' });
  for (const field of ['createdBy', 'tokenHash', 'maxDurationSeconds', '_id', 'createdAt', 'tokenIssuedAt']) {
    assert.equal(detailsOf(() => validateUpdateInput({ title: 'x', [field]: 'y' }, NOW)).status, 400, field);
  }
});

test('update: status must be active or closed', () => {
  assert.equal(validateUpdateInput({ status: 'active' }, NOW).set.status, 'active');
  for (const bad of ['expired', 'ACTIVE', '', null, 1, {}, ['active']]) {
    assert.ok(detailsOf(() => validateUpdateInput({ status: bad }, NOW)).details.status, String(bad));
  }
});

test('update: empty updates are rejected; expiresAt null clears the expiry', () => {
  assert.equal(detailsOf(() => validateUpdateInput({}, NOW)).status, 400);
  const cleared = validateUpdateInput({ expiresAt: null }, NOW);
  assert.deepEqual(cleared.unset, { expiresAt: 1 });
  assert.deepEqual(cleared.set, {});
});

test('update: invalid values are reported per field', () => {
  const result = detailsOf(() => validateUpdateInput({ title: '', question: 'x'.repeat(2001), expiresAt: 'nope' }, NOW));
  assert.ok(result.details.title && result.details.question && result.details.expiresAt);
});

test('pagination: defaults, valid values and strict rejection', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10 });
  assert.deepEqual(parsePagination({ page: '3', limit: '25' }), { page: 3, limit: 25 });
  for (const query of [{ page: '0' }, { page: '-1' }, { page: 'abc' }, { page: '1.5' }, { limit: '0' }, { limit: '51' }, { limit: '1e3' }, { page: ['1', '2'] }, { limit: { $gt: '' } }]) {
    assert.equal(detailsOf(() => parsePagination(query)).status, 400, JSON.stringify(query));
  }
});

test('ids: only 24-hex strings are valid (12-character strings are NOT)', () => {
  assert.equal(isValidObjectIdString('64b7f0c2a1b2c3d4e5f60718'), true);
  for (const bad of ['123456789012', 'abc', '', '64b7f0c2a1b2c3d4e5f6071', '64b7f0c2a1b2c3d4e5f607188', 'zzb7f0c2a1b2c3d4e5f60718', null, undefined, 5, {}, ['64b7f0c2a1b2c3d4e5f60718']]) {
    assert.equal(isValidObjectIdString(bad), false, JSON.stringify(bad));
  }
  assert.throws(() => assertValidId('nope'), { statusCode: 400, code: 'INVALID_ID' });
});
