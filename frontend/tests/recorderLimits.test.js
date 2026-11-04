import test from 'node:test';
import assert from 'node:assert/strict';
import RecorderController from '../src/services/RecorderController.js';
import { FakeStream, createFakeEnv, flush } from './helpers/fakeMedia.js';

async function recording(options = {}, controllerOptions = {}) {
  const fake = createFakeEnv(options);
  const recorder = new RecorderController({ env: fake.env, ...controllerOptions });
  await recorder.requestAccess();
  recorder.start();
  return { ...fake, recorder, state: () => recorder.getSnapshot() };
}

test('stops automatically at 59 minutes', async () => {
  const { recorder, recorders, clock, state, streams } = await recording();
  recorders[0].emit(5000);

  clock.advance(3_539_000);
  assert.equal(state().status, 'recording', 'still recording at 3539 s');
  assert.equal(state().elapsedSeconds, 3539);

  clock.advance(1500);
  await flush();
  assert.equal(state().status, 'recorded', 'stopped by itself at 3540 s');
  assert.ok(state().durationSeconds <= 3540);
  assert.ok(state().durationSeconds >= 3539.5);
  assert.match(state().notice, /maximum recording length/i);
  assert.ok(streams[0].allStopped, 'devices are released after the automatic stop');
  assert.equal(clock.activeTimers, 0);
  assert.ok(recorder);
});

test('a manual stop before the limit has no limit notice', async () => {
  const { recorder, recorders, clock, state } = await recording();
  recorders[0].emit(5000);
  clock.advance(30_000);
  recorder.stop();
  await flush();
  assert.equal(state().notice, '');
});

test('a recording that grows past the upload limit is stopped and refused', async () => {
  const { recorders, state, streams } = await recording({}, { maxBytes: 10_000 });
  recorders[0].emit(6000);
  assert.equal(state().status, 'recording');
  recorders[0].emit(6000); // 12,000 bytes > 10,000
  await flush();
  assert.equal(state().status, 'error');
  assert.equal(state().error.code, 'too_large');
  assert.match(state().error.message, /2 GiB/);
  assert.equal(state().blob, null, 'the oversized recording is not kept');
  assert.ok(streams[0].allStopped);
});

test('an empty recording is an error, not a submittable video', async () => {
  const { recorder, state } = await recording();
  recorder.stop(); // no data was ever delivered
  await flush();
  assert.equal(state().status, 'error');
  assert.equal(state().error.code, 'empty');
  assert.equal(state().blob, null);
});

test('unplugging the camera mid-recording keeps what was recorded', async () => {
  const { recorders, clock, state, streams } = await recording();
  recorders[0].emit(8000);
  clock.advance(4000);
  streams[0].getVideoTracks()[0].unplug();
  await flush();
  assert.equal(state().status, 'recorded');
  assert.equal(state().blob.size, 8000);
  assert.match(state().notice, /disconnected/i);
  assert.ok(streams[0].allStopped);
});

test('unplugging the camera before recording starts shows an error and a retry', async () => {
  const fake = createFakeEnv();
  const recorder = new RecorderController({ env: fake.env });
  await recorder.requestAccess();
  fake.streams[0].getAudioTracks()[0].unplug();
  assert.equal(recorder.getSnapshot().status, 'error');
  assert.equal(recorder.getSnapshot().error.code, 'device_lost');
  await recorder.requestAccess();
  assert.equal(recorder.getSnapshot().status, 'ready', 'the client can retry');
});

test('a recorder error discards the recording and releases the devices', async () => {
  const { recorders, state, streams } = await recording();
  recorders[0].emit(5000);
  recorders[0].onerror();
  assert.equal(state().status, 'error');
  assert.equal(state().error.code, 'recorder_failed');
  assert.ok(streams[0].allStopped);
});

test('re-record discards the old recording and starts again with a fresh camera stream', async () => {
  const { recorder, recorders, state, streams } = await recording();
  recorders[0].emit(9000);
  recorder.stop();
  await flush();
  const first = state().blob;
  assert.ok(first);

  await recorder.retake();
  assert.equal(state().status, 'ready');
  assert.equal(state().blob, null, 'the previous blob is dropped');
  assert.equal(streams.length, 2, 'a new stream was opened');
  assert.ok(streams[0].allStopped);
  assert.equal(streams[1].allStopped, false);
});

test('release() (leaving the page) stops the camera in every state', async () => {
  for (const setup of ['ready', 'recording']) {
    const fake = createFakeEnv();
    const recorder = new RecorderController({ env: fake.env });
    await recorder.requestAccess();
    if (setup === 'recording') recorder.start();
    recorder.release();
    assert.ok(fake.streams[0].allStopped, `${setup}: tracks stopped`);
    assert.equal(fake.clock.activeTimers, 0, `${setup}: timer cleared`);
    assert.equal(recorder.getSnapshot().status, 'idle');
    assert.equal(recorder.getSnapshot().stream, null);
  }
});

test('leaving the page while the permission prompt is open never leaves the camera on', async () => {
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const stream = new FakeStream();
  const fake = createFakeEnv({ getUserMedia: () => pending });
  const recorder = new RecorderController({ env: fake.env });

  const request = recorder.requestAccess();
  recorder.release(); // the user navigated away
  resolve(stream); // ...then clicked "Allow"
  await request;

  assert.ok(stream.allStopped, 'the late stream is switched off immediately');
  assert.equal(recorder.getSnapshot().status, 'idle');
});

test('late events from a discarded recorder are ignored', async () => {
  const { recorder, recorders, state } = await recording();
  const old = recorders[0];
  recorder.release();
  old.emit(1000);
  old.onstop?.();
  assert.equal(state().status, 'idle');
  assert.equal(state().blob, null);
});

test('each question uses the remaining shared allowance; a re-record starts with a fresh duration', async () => {
 const {recorder,recorders,clock,state}=await recording({}, {maxSeconds:3540});
 recorders[0].emit(5000);clock.advance(20_000);recorder.stop();await flush();
 assert.equal(state().durationSeconds,20);
 recorder.release();recorder.setMaxSeconds(5);await recorder.requestAccess();recorder.start();
 recorders[1].emit(5000);clock.advance(5500);await flush();
 assert.equal(state().status,'recorded');assert.equal(state().durationSeconds,5);
 recorder.release();recorder.setMaxSeconds(25);await recorder.requestAccess();recorder.start();
 recorders[2].emit(5000);clock.advance(3000);recorder.stop();await flush();
 assert.equal(state().durationSeconds,3,'the previous stop timestamp must not affect the new answer');
 recorder.release();
});
