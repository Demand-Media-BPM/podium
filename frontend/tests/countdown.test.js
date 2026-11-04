import test from 'node:test';
import assert from 'node:assert/strict';
import Countdown from '../src/services/Countdown.js';
import { createFakeClock } from './helpers/fakeMedia.js';

function setup(seconds = 3) {
  const clock = createFakeClock();
  const countdown = new Countdown({ seconds, env: { setInterval: clock.setInterval, clearInterval: clock.clearInterval } });
  const ticks = [];
  let done = 0;
  const start = () => countdown.start({ onTick: (n) => ticks.push(n), onDone: () => { done += 1; } });
  return { clock, countdown, ticks, start, doneCount: () => done };
}

test('counts 3, 2, 1 one second apart and then finishes exactly once', () => {
  const { clock, ticks, start, doneCount } = setup();
  assert.equal(start(), true);
  assert.deepEqual(ticks, [3], '"3" is shown immediately');
  clock.advance(1000);
  assert.deepEqual(ticks, [3, 2]);
  clock.advance(1000);
  assert.deepEqual(ticks, [3, 2, 1]);
  assert.equal(doneCount(), 0, 'recording must not start before the last second is over');
  clock.advance(1000);
  assert.equal(doneCount(), 1);
  clock.advance(10_000);
  assert.equal(doneCount(), 1, 'it never fires twice');
  assert.equal(clock.activeTimers, 0, 'the timer is cleaned up');
});

test('cancelling during the countdown never starts recording', () => {
  const { clock, countdown, ticks, start, doneCount } = setup();
  start();
  clock.advance(1500);
  countdown.cancel();
  clock.advance(10_000);
  assert.equal(doneCount(), 0);
  assert.deepEqual(ticks, [3, 2]);
  assert.equal(countdown.running, false);
  assert.equal(clock.activeTimers, 0);
});

test('a second start while counting is ignored (no double recording from a double click)', () => {
  const { clock, countdown, start, doneCount } = setup();
  assert.equal(start(), true);
  assert.equal(start(), false);
  assert.equal(countdown.running, true);
  clock.advance(3000);
  assert.equal(doneCount(), 1);
});

test('it can be used again after finishing or after being cancelled', () => {
  const { clock, countdown, start, doneCount } = setup();
  start();
  clock.advance(3000);
  assert.equal(start(), true);
  countdown.cancel();
  assert.equal(start(), true);
  clock.advance(3000);
  assert.equal(doneCount(), 2);
});

test('cancel() with nothing running is harmless', () => {
  const { countdown } = setup();
  assert.doesNotThrow(() => countdown.cancel());
  assert.equal(countdown.running, false);
});
