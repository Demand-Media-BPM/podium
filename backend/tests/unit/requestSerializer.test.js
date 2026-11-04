require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request, User } = require('../../models');
const { serializeRequest } = require('../../services/requestSerializer');

const OWNER = '64b7f0c2a1b2c3d4e5f60718';
const NOW = new Date('2026-06-01T12:00:00Z');

function makeDoc(overrides = {}) {
  return new Request({ title: 'T', question: 'Q', createdBy: OWNER, tokenHash: 'a'.repeat(64), tokenIssuedAt: NOW, ...overrides });
}

test('serialized requests never contain tokenHash or the raw hash value', () => {
  const output = serializeRequest(makeDoc(), 0, NOW);
  assert.ok(!('tokenHash' in output));
  assert.ok(!JSON.stringify(output).includes('a'.repeat(64)));
  assert.deepEqual(Object.keys(output).sort(), [
    'clientName', 'createdAt', 'createdBy', 'effectiveStatus', 'expiresAt', 'id', 'linkIssuedAt', 'maxDurationSeconds', 'microsite',
    'question', 'questions', 'responseCount', 'status', 'title', 'updatedAt',
  ]);
});

test('effectiveStatus: active, closed, and expired (closed wins over expired)', () => {
  assert.equal(serializeRequest(makeDoc(), 0, NOW).effectiveStatus, 'active');
  assert.equal(serializeRequest(makeDoc({ status: 'closed' }), 0, NOW).effectiveStatus, 'closed');
  assert.equal(serializeRequest(makeDoc({ expiresAt: new Date('2026-05-01T00:00:00Z') }), 0, NOW).effectiveStatus, 'expired');
  assert.equal(serializeRequest(makeDoc({ expiresAt: new Date('2026-07-01T00:00:00Z') }), 0, NOW).effectiveStatus, 'active');
  assert.equal(serializeRequest(makeDoc({ status: 'closed', expiresAt: new Date('2026-05-01T00:00:00Z') }), 0, NOW).effectiveStatus, 'closed');
  assert.equal(serializeRequest(makeDoc({ expiresAt: new Date('2026-05-01T00:00:00Z') }), 0, NOW).status, 'active', 'stored status is unchanged');
});

test('createdBy is returned as an id (or id + name when populated), never a full user', () => {
  const plain = serializeRequest(makeDoc(), 0, NOW).createdBy;
  assert.deepEqual(plain, { id: OWNER });
  assert.ok(!('name' in plain), 'no undefined name key for unpopulated owners');

  // Assigning a User document to a ref path is how Mongoose represents a populated reference.
  const owner = new User({ _id: OWNER, name: 'Erin', email: 'erin@example.com', passwordHash: 'secret-hash' });
  const populated = makeDoc({ createdBy: owner });
  const output = serializeRequest(populated, 0, NOW).createdBy;
  assert.deepEqual(output, { id: OWNER, name: 'Erin' });
  assert.ok(!JSON.stringify(output).includes('erin@example.com') && !JSON.stringify(output).includes('secret-hash'));
});

test('response count is passed through and defaults to 0', () => {
  assert.equal(serializeRequest(makeDoc(), 0, NOW).responseCount, 0);
  assert.equal(serializeRequest(makeDoc(), 7, NOW).responseCount, 7);
});

test('Request model: 150 character title limit and tokenIssuedAt field', () => {
  assert.ok(new Request({ title: 'a'.repeat(151), question: 'Q', createdBy: OWNER }).validateSync().errors.title);
  assert.equal(new Request({ title: 'a'.repeat(150), question: 'Q', createdBy: OWNER }).validateSync(), undefined);
  assert.ok(Request.schema.path('tokenIssuedAt'));
  assert.equal(Request.schema.path('tokenHash').options.select, false);
});
