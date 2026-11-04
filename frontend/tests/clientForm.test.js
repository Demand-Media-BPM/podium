import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName,
  validateEmail,
  validateConsent,
  validateClientForm,
  hasErrors,
  mapServerFieldErrors,
  createSubmissionId,
} from '../src/utils/clientForm.js';
import { describeSubmitError } from '../src/utils/submitError.js';
import { describeMediaError, extensionForMime, getRecordingSupport, pickRecordingMimeType } from '../src/utils/mediaSupport.js';
import { hasRecentSubmission, markSubmissionDone, clearSubmissionDone } from '../src/utils/thankYou.js';

test('name: required, trimmed, at most 100 characters', () => {
  assert.ok(validateName(''));
  assert.ok(validateName('   '));
  assert.ok(validateName(undefined));
  assert.equal(validateName('Carla Client'), '');
  assert.equal(validateName('a'.repeat(100)), '');
  assert.match(validateName('a'.repeat(101)), /100/);
});

test('email: valid formats pass, malformed ones fail with a clear message', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org', ' padded@example.com ']) assert.equal(validateEmail(ok), '', ok);
  for (const bad of ['', 'plain', '@x.com', 'a@', 'a@b', 'a b@x.com', '.a@x.com', 'a..b@x.com', 'a@x..com']) {
    assert.ok(validateEmail(bad), bad);
  }
  assert.match(validateEmail('nope'), /valid email/i);
  assert.match(validateEmail(`${'a'.repeat(250)}@b.co`), /254/);
});

test('consent is required', () => {
  assert.ok(validateConsent(false));
  assert.equal(validateConsent(true), '');
});

test('the whole form reports every problem at once', () => {
  const errors = validateClientForm({ name: '', email: 'x', consent: false });
  assert.ok(errors.name && errors.email && errors.consent);
  assert.ok(hasErrors(errors));
  assert.equal(hasErrors(validateClientForm({ name: 'A', email: 'a@b.co', consent: true })), false);
});

test('server field names map onto form fields', () => {
  assert.deepEqual(mapServerFieldErrors({ clientName: 'n', clientEmail: 'e', consentAccepted: 'c', other: 'x' }), {
    name: 'n',
    email: 'e',
    consent: 'c',
  });
  assert.deepEqual(mapServerFieldErrors(undefined), {});
});

test('submission ids are unique version-4 UUIDs', () => {
  const ids = new Set(Array.from({ length: 500 }, createSubmissionId));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('upload errors: network failures are retryable and keep the recording', () => {
  const result = describeSubmitError({ message: 'Network Error' });
  assert.equal(result.retryable, true);
  assert.match(result.message, /recording is still here/i);
});

test('upload errors: each server response gets a clear message and a retry decision', () => {
  const make = (status, data) => describeSubmitError({ response: { status, data } });
  assert.equal(make(404, { code: 'LINK_UNAVAILABLE' }).retryable, false);
  assert.match(make(413, { code: 'VIDEO_TOO_LARGE' }).message, /2 GiB/);
  assert.equal(make(415, { code: 'UNSUPPORTED_VIDEO' }).retryable, false);
  assert.equal(make(429, {}).retryable, true);
  assert.equal(make(500, { message: 'internal detail' }).retryable, true);
  assert.ok(!make(500, { message: 'internal detail' }).message.includes('internal detail'), 'server internals are not shown');
  const validation = make(400, { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields', details: { clientEmail: 'bad' } });
  assert.deepEqual(validation.fieldErrors, { clientEmail: 'bad' });
  assert.equal(validation.retryable, false);
});

test('camera errors are described in plain language', () => {
  assert.equal(describeMediaError({ name: 'NotAllowedError' }).code, 'permission_denied');
  assert.equal(describeMediaError({ name: 'NotFoundError' }).code, 'no_device');
  assert.equal(describeMediaError({ name: 'NotReadableError' }).code, 'in_use');
  assert.equal(describeMediaError(new Error('boom')).code, 'unknown');
});

test('recording support detection', () => {
  const MR = class {};
  const devices = { getUserMedia() {} };
  assert.equal(getRecordingSupport({ mediaDevices: devices, MediaRecorder: MR, isSecureContext: true }).ok, true);
  assert.equal(getRecordingSupport({ mediaDevices: devices, MediaRecorder: MR, isSecureContext: false }).error.code, 'insecure');
  assert.equal(getRecordingSupport({ mediaDevices: undefined, MediaRecorder: MR, isSecureContext: true }).error.code, 'unsupported');
  assert.equal(getRecordingSupport({ mediaDevices: devices, MediaRecorder: undefined, isSecureContext: true }).error.code, 'unsupported');
  assert.equal(pickRecordingMimeType(undefined), '');
  assert.equal(extensionForMime('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(extensionForMime('video/webm'), 'webm');
});

test('thank-you proof: only a recent confirmed submission counts, and nothing sensitive is stored', () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  };
  try {
    assert.equal(hasRecentSubmission(), false, 'a direct visit shows no success');
    markSubmissionDone(1_000);
    assert.equal(hasRecentSubmission(1_000 + 60_000), true);
    assert.equal(hasRecentSubmission(1_000 + 31 * 60_000), false, 'expires');
    assert.equal(hasRecentSubmission(500), false, 'a timestamp in the future is not accepted');
    assert.deepEqual([...store.values()], ['1000'], 'only a timestamp is stored');
    clearSubmissionDone();
    assert.equal(hasRecentSubmission(1_000), false);
    store.set('vrt_submission_done', 'garbage');
    assert.equal(hasRecentSubmission(), false);
  } finally {
    delete globalThis.window;
  }
});
