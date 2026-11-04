require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  getPasswordPolicyError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} = require('../../services/passwordService');

test('passwords are hashed with Argon2id and never stored in plaintext', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('$argon2id$'));
  assert.ok(!hash.includes('correct horse'));
});

test('the same password produces different hashes (random salt)', async () => {
  const a = await hashPassword('same-password-123');
  const b = await hashPassword('same-password-123');
  assert.notEqual(a, b);
});

test('verifyPassword accepts the right password and rejects the wrong one', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword(hash, 'correct horse battery staple'), true);
  assert.equal(await verifyPassword(hash, 'wrong password!!'), false);
});

test('verifyPassword returns false (does not throw) for malformed hashes', async () => {
  assert.equal(await verifyPassword('not-a-hash', 'whatever'), false);
  assert.equal(await verifyPassword('', 'whatever'), false);
});

test('password policy enforces minimum and maximum length', () => {
  assert.ok(getPasswordPolicyError('short'));
  assert.ok(getPasswordPolicyError('a'.repeat(MIN_PASSWORD_LENGTH - 1)));
  assert.equal(getPasswordPolicyError('a'.repeat(MIN_PASSWORD_LENGTH)), null);
  assert.ok(getPasswordPolicyError('a'.repeat(MAX_PASSWORD_LENGTH + 1)));
  assert.ok(getPasswordPolicyError(undefined));
  assert.ok(getPasswordPolicyError(12345678901234));
});
