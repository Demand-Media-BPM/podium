require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCreateInput, TITLE_MAX, QUESTION_MAX } = require('../../services/requestValidation');

const NOW = new Date('2026-06-01T12:00:00Z');
const valid = { title: 'Project feedback', question: 'What did you like?' };

const detailsOf = (fn) => {
  try { fn(); } catch (err) { return { status: err.statusCode, details: err.details, code: err.code }; }
  return null;
};

test('create: accepts a valid request and trims/normalizes text', () => {
  const data = validateCreateInput({ title: '  Project   feedback \n', question: '  Line 1\r\nLine 2  ' }, NOW);
  assert.equal(data.title, 'Project feedback');
  assert.equal(data.question, 'Line 1\nLine 2');
  assert.equal(data.expiresAt, undefined);
});

test('create: title and question are required (missing, blank, wrong type)', () => {
  for (const body of [{}, { title: '', question: '' }, { title: '   ', question: '\n\n' }, { title: 5, question: {} }, { title: null, question: [] }]) {
    const result = detailsOf(() => validateCreateInput(body, NOW));
    assert.equal(result.status, 400);
    assert.ok(result.details.title && result.details.question, JSON.stringify(body));
  }
});

test('create: enforces the 150 / 2000 character limits exactly', () => {
  assert.doesNotThrow(() => validateCreateInput({ title: 'a'.repeat(TITLE_MAX), question: 'b'.repeat(QUESTION_MAX) }, NOW));
  assert.ok(detailsOf(() => validateCreateInput({ ...valid, title: 'a'.repeat(TITLE_MAX + 1) }, NOW)).details.title);
  assert.ok(detailsOf(() => validateCreateInput({ ...valid, question: 'b'.repeat(QUESTION_MAX + 1) }, NOW)).details.question);
  assert.equal(TITLE_MAX, 150);
  assert.equal(QUESTION_MAX, 2000);
});

test('create: removes control, zero-width and bidi-override characters but keeps HTML as plain text', () => {
  const data = validateCreateInput({ title: 'Hi\u0000\u200B\u202E there', question: '<script>alert(1)</script> & "quotes"' }, NOW);
  assert.equal(data.title, 'Hi there');
  assert.equal(data.question, '<script>alert(1)</script> & "quotes"', 'stored as text; React escapes it on render');
});

test('create: single-line title collapses newlines; question keeps them', () => {
  const data = validateCreateInput({ title: 'a\nb\tc', question: 'a\n\nb' }, NOW);
  assert.equal(data.title, 'a b c');
  assert.equal(data.question, 'a\n\nb');
});

test('create: mass assignment - unknown or protected fields are rejected', () => {
  for (const field of ['createdBy', 'tokenHash', 'token', 'status', 'maxDurationSeconds', '_id', 'role', 'isAdmin', '$set']) {
    const result = detailsOf(() => validateCreateInput({ ...valid, [field]: 'x' }, NOW));
    assert.equal(result.status, 400, field);
    assert.ok(result.details.fields.includes(field), field);
  }
});

test('create: non-object bodies are rejected', () => {
  for (const body of [undefined, null, 'text', 5, [], [valid]]) {
    assert.equal(detailsOf(() => validateCreateInput(body, NOW)).status, 400);
  }
});

test('expiresAt: optional, must be a future ISO date within 5 years', () => {
  assert.equal(validateCreateInput({ ...valid, expiresAt: null }, NOW).expiresAt, undefined);
  assert.equal(validateCreateInput({ ...valid, expiresAt: '' }, NOW).expiresAt, undefined);
  assert.equal(validateCreateInput({ ...valid, expiresAt: '2026-12-31T23:59:00Z' }, NOW).expiresAt.toISOString(), '2026-12-31T23:59:00.000Z');
  for (const bad of ['yesterday', '2026-13-45', '2026-06-01T11:00:00Z', '2026-06-01T12:00:00Z', '2032-01-01T00:00:00Z', 12345, {}, true, 'DROP TABLE']) {
    assert.ok(detailsOf(() => validateCreateInput({ ...valid, expiresAt: bad }, NOW)).details.expiresAt, String(bad));
  }
});
