// A pre-recording countdown (3, 2, 1, then go). Plain JavaScript with injectable timers so it can be unit tested.
//
// The countdown only ever ENDS by calling onDone once. cancel() stops it for good without calling onDone, so stopping
// during the countdown can never start a recording. A second start() while one is running is ignored, which is what
// prevents two recordings from being started by a double click.

const defaultEnv = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
};

export default class Countdown {
  constructor({ seconds = 3, env = defaultEnv } = {}) {
    this._seconds = seconds;
    this._env = env;
    this._timer = null;
    this._remaining = 0;
    this._onTick = null;
    this._onDone = null;
  }

  get running() {
    return this._timer !== null;
  }

  // Returns false (and does nothing) if a countdown is already running.
  start({ onTick = () => {}, onDone = () => {} } = {}) {
    if (this.running) return false;
    this._remaining = this._seconds;
    this._onTick = onTick;
    this._onDone = onDone;
    onTick(this._remaining); // show "3" immediately
    this._timer = this._env.setInterval(() => this._step(), 1000);
    return true;
  }

  _step() {
    this._remaining -= 1;
    if (this._remaining > 0) {
      this._onTick(this._remaining);
      return;
    }
    const done = this._onDone;
    this._clear();
    done();
  }

  cancel() {
    this._clear();
  }

  _clear() {
    if (this._timer !== null) this._env.clearInterval(this._timer);
    this._timer = null;
    this._onTick = null;
    this._onDone = null;
  }
}
