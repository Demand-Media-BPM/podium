// Fake browser media APIs so RecorderController can be tested in Node without a camera.

export class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.stopped = false;
    this.listeners = new Set();
  }

  stop() {
    this.stopped = true;
  }

  addEventListener(type, fn) {
    if (type === 'ended') this.listeners.add(fn);
  }

  removeEventListener(type, fn) {
    if (type === 'ended') this.listeners.delete(fn);
  }

  // Simulates the camera or microphone being unplugged.
  unplug() {
    this.stopped = true;
    [...this.listeners].forEach((fn) => fn());
  }
}

export class FakeStream {
  constructor({ video = true, audio = true } = {}) {
    this.tracks = [];
    if (video) this.tracks.push(new FakeTrack('video'));
    if (audio) this.tracks.push(new FakeTrack('audio'));
  }

  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }

  get allStopped() {
    return this.tracks.every((t) => t.stopped);
  }
}

export function createFakeClock() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms, next: now + ms });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    get activeTimers() {
      return timers.size;
    },
    // Moves time forward, firing interval callbacks as they come due.
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.next <= end).sort((a, b) => a[1].next - b[1].next)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.next;
        timer.next += timer.ms;
        timer.fn();
        if (!timers.has(id)) continue;
      }
      now = end;
    },
  };
}

// Builds the `env` object RecorderController accepts. `getUserMedia` behaviour can be customised per test.
export function createFakeEnv({ getUserMedia, supportedTypes = ['video/webm;codecs=vp9,opus', 'video/webm'], isSecureContext = true } = {}) {
  const clock = createFakeClock();
  const streams = [];
  const recorders = [];
  const calls = [];

  class FakeMediaRecorder {
    static isTypeSupported(type) {
      return supportedTypes.includes(type);
    }

    constructor(stream, options = {}) {
      this.stream = stream;
      this.options = options;
      this.state = 'inactive';
      this.mimeType = options.mimeType || 'video/webm';
      recorders.push(this);
    }

    start() {
      this.state = 'recording';
    }

    // Delivers a chunk of `size` bytes like MediaRecorder's dataavailable event.
    emit(size) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
    }

    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      Promise.resolve().then(() => this.onstop?.());
    }
  }

  const defaultGetUserMedia = async (constraints) => {
    calls.push(constraints);
    const stream = new FakeStream();
    streams.push(stream);
    return stream;
  };

  return {
    env: {
      mediaDevices: { getUserMedia: async (c) => (getUserMedia || defaultGetUserMedia)(c, { calls, streams }) },
      MediaRecorder: FakeMediaRecorder,
      isSecureContext,
      now: clock.now,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval,
    },
    clock,
    streams,
    recorders,
    calls,
  };
}

export const flush = () => new Promise((resolve) => setImmediate(resolve));
