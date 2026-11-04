import test from 'node:test';
import assert from 'node:assert/strict';
import RecorderController from '../src/services/RecorderController.js';
import { FakeStream, createFakeEnv, flush } from './helpers/fakeMedia.js';

async function ready(options) {
  const fake = createFakeEnv(options);
  const recorder = new RecorderController({ env: fake.env });
  await recorder.requestAccess();
  return { ...fake, recorder, state: () => recorder.getSnapshot() };
}

test('requests both video and audio, preferring 720p without requiring it', async () => {
  const { calls, state } = await ready();
  assert.equal(state().status, 'ready');
  assert.ok(calls[0].video && calls[0].audio, 'both tracks are requested');
  assert.equal(calls[0].video.height.ideal, 720);
  assert.equal(calls[0].video.height.exact, undefined, '720p is only a preference');
});

test('falls back to basic constraints when the device cannot do 720p', async () => {
  const seen = [];
  const { state, streams } = await ready({
    getUserMedia: async (constraints) => {
      seen.push(constraints);
      if (seen.length === 1) throw Object.assign(new Error('x'), { name: 'OverconstrainedError' });
      return new FakeStream();
    },
  });
  assert.equal(state().status, 'ready');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], { video: true, audio: true });
  assert.equal(streams.length, 0);
});

test('shows a useful message for each permission failure', async () => {
  const cases = {
    NotAllowedError: /blocked/i,
    NotFoundError: /no camera or microphone/i,
    NotReadableError: /in use|could not be started/i,
  };
  for (const [name, expected] of Object.entries(cases)) {
    const { state } = await ready({ getUserMedia: async () => { throw Object.assign(new Error('x'), { name }); } });
    assert.equal(state().status, 'error', name);
    assert.match(state().error.message, expected, name);
  }
});

test('can retry after a denied permission', async () => {
  let attempt = 0;
  const { recorder, state } = await ready({
    getUserMedia: async () => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
      return new FakeStream();
    },
  });
  assert.equal(state().status, 'error');
  await recorder.requestAccess();
  assert.equal(state().status, 'ready');
  assert.equal(state().error, null);
});

test('refuses to run on an insecure page and in browsers without recording support', async () => {
  const insecure = await ready({ isSecureContext: false });
  assert.equal(insecure.state().status, 'error');
  assert.equal(insecure.state().error.code, 'insecure');
  assert.match(insecure.state().error.message, /https/i);

  const noRecorder = createFakeEnv();
  noRecorder.env.MediaRecorder = undefined;
  const controller = new RecorderController({ env: noRecorder.env });
  await controller.requestAccess();
  assert.equal(controller.getSnapshot().error.code, 'unsupported');
});

test('requires a camera AND a microphone', async () => {
  const stream = new FakeStream({ audio: false });
  const { state } = await ready({ getUserMedia: async () => stream });
  assert.equal(state().status, 'error');
  assert.ok(stream.allStopped, 'the partial stream is switched off');
});

test('start and stop produce a recording and switch the camera off', async () => {
  const { recorder, recorders, state, streams, clock } = await ready();
  recorder.start();
  recorders[0].emit(20_000);
  assert.equal(state().status, 'recording');
  assert.equal(streams[0].allStopped, false, 'camera stays on while recording');
  clock.advance(5200);
  assert.equal(state().elapsedSeconds, 5);

  const instance = recorder;
  instance.stop();
  await flush();
  assert.equal(state().status, 'recorded');
  assert.ok(streams[0].allStopped, 'camera and microphone are stopped when recording finishes');
  assert.equal(clock.activeTimers, 0, 'the timer is cleared');
});

test('stopping keeps the recorded data and reports the duration', async () => {
  const { recorder, recorders, clock, state } = await ready();
  recorder.start();
  recorders[0].emit(12_345);
  clock.advance(7000);
  recorder.stop();
  await flush();
  assert.equal(state().status, 'recorded');
  assert.equal(state().blob.size, 12_345);
  assert.equal(state().durationSeconds, 7);
  assert.match(state().mimeType, /^video\/webm/);
});

test('picks the recording format the browser supports: WebM first, then MP4 for Safari', async () => {
  const chrome = await ready({ supportedTypes: ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] });
  chrome.recorder.start();
  assert.equal(chrome.recorders[0].options.mimeType, 'video/webm;codecs=vp9,opus');

  const safari = await ready({ supportedTypes: ['video/mp4'] });
  safari.recorder.start();
  assert.equal(safari.recorders[0].options.mimeType, 'video/mp4');

  const unknown = await ready({ supportedTypes: [] });
  unknown.recorder.start();
  assert.equal(unknown.recorders[0].options.mimeType, undefined, 'no hardcoded format: the browser default is used');
  assert.equal(unknown.state().status, 'recording');
});

test('ignores invalid actions (start before access, stop when idle, double start)', async () => {
  const fake = createFakeEnv();
  const recorder = new RecorderController({ env: fake.env });
  recorder.start();
  recorder.stop();
  assert.equal(recorder.getSnapshot().status, 'idle');
  await recorder.requestAccess();
  recorder.start();
  recorder.start();
  assert.equal(fake.recorders.length, 1, 'a second start does not create a second recorder');
});
