import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSubmitError } from '../src/utils/submitError.js';
import { describeVideoAccessError, canAccessVideo } from '../src/utils/videoAccess.js';
import { formatBytes } from '../src/utils/format.js';
import { httpError } from './helpers/fakeSubmission.js';

test('submit error messages cover the S3 cases', () => {
  assert.equal(describeSubmitError(httpError(502, 'STORAGE_UNAVAILABLE')).retryable, true);
  assert.equal(describeSubmitError(httpError(409, 'UPLOAD_MISSING')).retryable, true);
  assert.equal(describeSubmitError(httpError(409, 'SUBMISSION_CLOSED')).restart, true);
  assert.equal(describeSubmitError(httpError(422, 'UPLOAD_INVALID')).restart, true);
  assert.equal(describeSubmitError(httpError(413, 'VIDEO_TOO_LARGE')).retryable, false);
  assert.equal(describeSubmitError(httpError(415, 'UNSUPPORTED_VIDEO')).retryable, false);
});

test('video access errors: expired and missing are final, others can be retried', () => {
  const expired = describeVideoAccessError(httpError(410, 'VIDEO_EXPIRED'));
  assert.equal(expired.code, 'VIDEO_EXPIRED');
  assert.match(expired.message, /180-day/);
  assert.match(describeVideoAccessError(httpError(410, 'VIDEO_MISSING')).message, /no longer available/);
  assert.match(describeVideoAccessError(httpError(404)).message, /not be found|access/i);
  assert.match(describeVideoAccessError(httpError(502, 'STORAGE_UNAVAILABLE')).message, /temporarily unavailable/);
  assert.match(describeVideoAccessError(httpError(409, 'LOCAL_VIDEO_UNAVAILABLE')).message, /local development/);
});

test('Play and Download are offered only for playable, non-expired responses', () => {
  assert.equal(canAccessVideo({ playable: true, effectiveStatus: 'submitted' }), true);
  assert.equal(canAccessVideo({ playable: true, effectiveStatus: 'expired' }), false);
  assert.equal(canAccessVideo({ playable: false, effectiveStatus: 'submitted' }), false);
  assert.equal(canAccessVideo(null), false);
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(null), '-');
  assert.equal(formatBytes(-1), '-');
});
