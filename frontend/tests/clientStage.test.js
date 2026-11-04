import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStage, stageIndex, STAGES } from '../src/utils/clientStage.js';
import { filterRequests } from '../src/utils/requestSearch.js';
import { getInitials, getFirstName } from '../src/utils/people.js';
import { formatClock } from '../src/utils/format.js';

const base = { detailsConfirmed: true, recorderStatus: 'ready', hasRecording: false, reviewConfirmed: false };

test('the client journey starts at details and follows the real recorder state', () => {
  assert.equal(deriveStage({ ...base, detailsConfirmed: false }), 'details');
  assert.equal(deriveStage({ ...base, recorderStatus: 'idle' }), 'record');
  assert.equal(deriveStage({ ...base, recorderStatus: 'requesting' }), 'record');
  assert.equal(deriveStage({ ...base, recorderStatus: 'ready' }), 'record');
  assert.equal(deriveStage({ ...base, recorderStatus: 'recording' }), 'record');
  assert.equal(deriveStage({ ...base, recorderStatus: 'error' }), 'record');
});

test('review comes after a real, non-empty recording, and submit only after the client confirms the review', () => {
  assert.equal(deriveStage({ ...base, recorderStatus: 'recorded', hasRecording: true }), 'review');
  assert.equal(deriveStage({ ...base, recorderStatus: 'recorded', hasRecording: true, reviewConfirmed: true }), 'submit');
  assert.equal(deriveStage({ ...base, recorderStatus: 'recorded', hasRecording: false }), 'record', 'an empty recording is not reviewable');
});

test('re-recording sends the client back to the record step even if the review had been confirmed', () => {
  assert.equal(deriveStage({ ...base, recorderStatus: 'requesting', reviewConfirmed: true }), 'record');
  assert.equal(deriveStage({ ...base, recorderStatus: 'ready', hasRecording: false, reviewConfirmed: true }), 'record');
});

test('stage indexes match their order', () => {
  assert.deepEqual(STAGES, ['details', 'record', 'review', 'submit']);
  assert.deepEqual(STAGES.map(stageIndex), [0, 1, 2, 3]);
  assert.equal(stageIndex('nonsense'), 0);
});

test('request search matches title, question and owner, ignores case and blanks', () => {
  const requests = [
    { id: 1, title: 'Project Feedback', question: 'How did it go?', createdBy: { name: 'Erin' } },
    { id: 2, title: 'Intro', question: 'Tell us about your team', createdBy: { name: 'Olga' } },
    { id: 3, title: 'Weekly', question: '', createdBy: undefined },
  ];
  assert.equal(filterRequests(requests, '').length, 3);
  assert.equal(filterRequests(requests, '   ').length, 3);
  assert.deepEqual(filterRequests(requests, 'feedback').map((r) => r.id), [1]);
  assert.deepEqual(filterRequests(requests, 'YOUR TEAM').map((r) => r.id), [2]);
  assert.deepEqual(filterRequests(requests, 'olga').map((r) => r.id), [2]);
  assert.deepEqual(filterRequests(requests, 'zzz'), []);
  assert.equal(filterRequests(requests, undefined).length, 3);
});

test('initials and first names', () => {
  assert.equal(getInitials('Erin Employee'), 'EE');
  assert.equal(getInitials('  ada   king lovelace '), 'AL');
  assert.equal(getInitials('madonna'), 'M');
  assert.equal(getInitials(''), '?');
  assert.equal(getInitials(null), '?');
  assert.equal(getFirstName('Erin Employee'), 'Erin');
  assert.equal(getFirstName(undefined), '');
});

test('formatClock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7.9), '0:07');
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(120), '2:00');
  assert.equal(formatClock(-3), '0:00');
  assert.equal(formatClock(NaN), '0:00');
});
