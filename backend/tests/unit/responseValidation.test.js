require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  validateSubmissionFields,
  validateClientEmail,
  validateClientName,
  validateConsent,
  validateDuration,
} = require('../../services/responseValidation');

const base = () => ({
  submissionId: crypto.randomUUID(),
  clientName: '  Carla   Client ',
  clientEmail: ' Carla@Example.COM ',
  consentAccepted: 'true',
  durationSeconds: '42.5',
});
const run = (body) => validateSubmissionFields(body, { maxDurationSeconds: 120 });
const fieldErrors = (body) => {
  try {
    run(body);
  } catch (err) {
    return err.details;
  }
  return null;
};

test('valid input is normalised', () => {
  const data = run(base());
  assert.equal(data.clientName, 'Carla Client');
  assert.equal(data.clientEmail, 'carla@example.com');
  assert.equal(data.consentAccepted, true);
  assert.equal(data.durationSeconds, 42.5);
});

test('name: required and at most 100 characters', () => {
  assert.ok(validateClientName('').error);
  assert.ok(validateClientName('   ').error);
  assert.ok(validateClientName(undefined).error);
  assert.ok(validateClientName(['a']).error);
  assert.equal(validateClientName('a'.repeat(100)).value.length, 100);
  assert.ok(validateClientName('a'.repeat(101)).error);
});

test('name: strips control and invisible characters', () => {
  assert.equal(validateClientName('Ann\u0000\u200B e').value, 'Ann e');
});

test('email: accepts normal addresses and lowercases them', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org', "o'neil@example.com"]) {
    assert.ok(validateClientEmail(ok).value, ok);
  }
});

test('email: rejects malformed addresses', () => {
  const bad = ['', 'plain', '@example.com', 'a@', 'a@b', 'a b@example.com', 'a@exa mple.com', '.a@example.com', 'a..b@example.com', 'a@-example.com', 'a@example..com', 'a@@example.com', 'a@example.com\nBcc: x@y.com', ['a@b.co']];
  for (const value of bad) assert.ok(validateClientEmail(value).error, JSON.stringify(value));
});

test('email: at most 254 characters', () => {
  const longDomain = `${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`;
  assert.ok(`x@${longDomain}`.length < 254);
  assert.ok(validateClientEmail(`x@${longDomain}`).value);
  assert.ok(validateClientEmail(`${'a'.repeat(64)}@${longDomain}.${'e'.repeat(40)}.org`).error);
});

test('consent: only the exact string "true" is accepted', () => {
  assert.equal(validateConsent('true').value, true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'on', true, 1, ['true']]) {
    assert.ok(validateConsent(value).error, String(value));
  }
});

test('duration: must be a positive number within the limit (small tolerance)', () => {
  assert.equal(validateDuration('120', 120).value, 120);
  assert.equal(validateDuration('121.5', 120).value, 120, 'timer latency is clamped, not rejected');
  assert.ok(validateDuration('123', 120).error);
  for (const bad of ['0', '-5', 'abc', '', '1e3', 'NaN', 'Infinity', undefined, '12345']) {
    assert.ok(validateDuration(bad, 120).error, String(bad));
  }
});

test('fields: unexpected fields are rejected (no mass assignment)', () => {
  for (const extra of ['status', 'requestId', 'videoKey', 'fileSize', 'deleteAt', 'mimeType', '__proto__']) {
    const errors = fieldErrors({ ...base(), [extra]: 'x' });
    assert.ok(errors && errors.fields, extra);
  }
});

test('fields: every problem is reported with its own message', () => {
  const errors = fieldErrors({ submissionId: 'nope', clientName: '', clientEmail: 'x', consentAccepted: 'false', durationSeconds: '0' });
  assert.deepEqual(Object.keys(errors).sort(), ['clientEmail', 'clientName', 'consentAccepted', 'durationSeconds', 'submissionId']);
});

test('fields: submission id must be a UUID', () => {
  for (const bad of [undefined, '', '123', 'g'.repeat(36), `${crypto.randomUUID()}x`, '../../etc/passwd']) {
    assert.ok(fieldErrors({ ...base(), submissionId: bad })?.submissionId, String(bad));
  }
});
