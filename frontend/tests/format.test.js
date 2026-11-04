import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, getApiError, isoToLocalInput, localInputToIso, formatDate, formatDateTime } from '../src/utils/format.js';
import { validateForm } from '../src/utils/requestForm.js';

test('formatDuration', () => {
  assert.equal(formatDuration(120), '2 minutes');
  assert.equal(formatDuration(60), '1 minute');
  assert.equal(formatDuration(90), '90 seconds');
  assert.equal(formatDuration(undefined), '-');
});

test('date helpers tolerate missing and invalid values', () => {
  assert.equal(formatDate(null), '-');
  assert.equal(formatDateTime('not a date'), '-');
  assert.equal(localInputToIso(''), null);
  assert.equal(localInputToIso('garbage'), null);
  assert.equal(isoToLocalInput(null), '');
});

test('datetime-local values round-trip through ISO', () => {
  const iso = localInputToIso('2030-05-17T14:30');
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(isoToLocalInput(iso), '2030-05-17T14:30');
});

test('getApiError: network errors, server messages, field details and 5xx masking', () => {
  assert.equal(getApiError({}).status, 0);
  assert.match(getApiError({}).message, /Cannot reach the server/);

  const validation = getApiError({ response: { status: 400, data: { message: 'Please correct the highlighted fields', details: { title: 'Title is required' } } } });
  assert.equal(validation.message, 'Please correct the highlighted fields');
  assert.deepEqual(validation.fieldErrors, { title: 'Title is required' });

  const server = getApiError({ response: { status: 500, data: { message: 'internal stack details' } } }, 'Fallback text');
  assert.equal(server.message, 'Fallback text', 'server error text is never shown to the user');

  assert.match(getApiError({ response: { status: 429, data: {} } }).message, /Too many requests/);
  assert.deepEqual(getApiError({ response: { status: 400, data: { details: 'not an object' } } }).fieldErrors, {});
});

test('validateForm mirrors the server limits', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.deepEqual(validateForm({ title: 'T', question: 'Q', expiresAt: '' }, now), {});
  assert.ok(validateForm({ title: '  ', question: '', expiresAt: '' }, now).title);
  assert.ok(validateForm({ title: '  ', question: '', expiresAt: '' }, now).question);
  assert.ok(validateForm({ title: 'a'.repeat(151), question: 'Q', expiresAt: '' }, now).title);
  assert.deepEqual(validateForm({ title: 'a'.repeat(150), question: 'q'.repeat(2000), expiresAt: '' }, now), {});
  assert.ok(validateForm({ title: 'T', question: 'q'.repeat(2001), expiresAt: '' }, now).question);
  assert.ok(validateForm({ title: 'T', question: 'Q', expiresAt: '2020-01-01T10:00' }, now).expiresAt);
  assert.ok(validateForm({ title: 'T', question: 'Q', expiresAt: 'nope' }, now).expiresAt);
  assert.deepEqual(validateForm({ title: 'T', question: 'Q', expiresAt: '2030-01-01T10:00' }, now), {});
});
