import { MAX_DURATION_SECONDS, MAX_UPLOAD_BYTES } from '../constants.js';
import {
  BASIC_CONSTRAINTS,
  IDEAL_CONSTRAINTS,
  describeMediaError,
  getRecordingSupport,
  isConstraintError,
  pickRecordingMimeType,
  stopStream,
} from '../utils/mediaSupport.js';

// Camera + microphone recording with the browser's native getUserMedia and MediaRecorder APIs.
// Plain JavaScript (no React) so it can be unit tested with fakes; useRecorder.js connects it to React.
//
// Lifecycle:  idle -> requesting -> ready -> recording -> recorded
//                          \-> error (from any step; retry with requestAccess())
// The camera and microphone are switched off (tracks stopped) as soon as recording finishes, fails or the
// component using the controller goes away (release()).

const VIDEO_BITS_PER_SECOND = 2_500_000; // ~2.5 Mbps targets about 1.2 GB for 59 minutes, below the 2 GiB ceiling
const AUDIO_BITS_PER_SECOND = 128_000;
const TIMESLICE_MS = 1000;
const TICK_MS = 250;

const INITIAL = {
  status: 'idle', // idle | requesting | ready | recording | recorded | error
  error: null, // { code, message }
  notice: '', // non-fatal information shown with a finished recording
  elapsedSeconds: 0,
  durationSeconds: 0,
  blob: null,
  mimeType: '',
  stream: null,
};

function browserEnv() {
  return {
    mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
    MediaRecorder: typeof window !== 'undefined' ? window.MediaRecorder : undefined,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : undefined,
    now: () => Date.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  };
}

export default class RecorderController {
  constructor({ env, maxSeconds = MAX_DURATION_SECONDS, maxBytes = MAX_UPLOAD_BYTES } = {}) {
    this._env = env || browserEnv();
    this._maxSeconds = maxSeconds;
    this._maxBytes = maxBytes;
    this._snapshot = INITIAL;
    this._listeners = new Set();
    this._generation = 0; // invalidates in-flight permission requests after release()
    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._bytes = 0;
    this._timer = null;
    this._startedAt = 0;
    this._stoppedAt = 0;
    this._stopReason = '';
    this._mimeType = '';
    this._onTrackEnded = this._onTrackEnded.bind(this);
  }

  // ----- store API (used with React's useSyncExternalStore) -----
  subscribe = (listener) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = () => this._snapshot;

  _set(patch) {
    this._snapshot = { ...this._snapshot, ...patch };
    this._listeners.forEach((listener) => listener());
  }

  // Limits can be updated between questions; never during a recording.
  setMaxSeconds(seconds) {
    if (this._snapshot.status === 'recording') return;
    this._maxSeconds = Math.max(0, seconds);
  }
  get maxSeconds() { return this._maxSeconds; }

  // ----- actions -----
  async requestAccess() {
    const { status } = this._snapshot;
    if (status === 'requesting' || status === 'recording') return;

    const support = getRecordingSupport(this._env);
    if (!support.ok) {
      this._fail(support.error);
      return;
    }

    this._discardRecording();
    const generation = (this._generation += 1);
    this._set({ ...INITIAL, status: 'requesting' });

    let stream;
    try {
      stream = await this._openStream();
    } catch (err) {
      if (generation === this._generation) this._fail(describeMediaError(err));
      return;
    }
    // The page was left (or reset) while the permission prompt was open: do not keep the camera on.
    if (generation !== this._generation) {
      stopStream(stream);
      return;
    }
    if (stream.getVideoTracks().length === 0 || stream.getAudioTracks().length === 0) {
      stopStream(stream);
      this._fail({ code: 'no_device', message: 'Both a camera and a microphone are required.' });
      return;
    }

    this._stream = stream;
    stream.getTracks().forEach((track) => track.addEventListener('ended', this._onTrackEnded));
    this._set({ status: 'ready', stream });
  }

  async _openStream() {
    const { mediaDevices } = this._env;
    try {
      return await mediaDevices.getUserMedia(IDEAL_CONSTRAINTS);
    } catch (err) {
      if (!isConstraintError(err)) throw err;
      return mediaDevices.getUserMedia(BASIC_CONSTRAINTS); // device cannot do 720p: use what it can
    }
  }

  start() {
    if (this._snapshot.status !== 'ready' || !this._stream || this._maxSeconds <= 0) return;

    const { MediaRecorder } = this._env;
    this._mimeType = pickRecordingMimeType(MediaRecorder);
    const options = { videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
    let recorder;
    try {
      recorder = new MediaRecorder(this._stream, this._mimeType ? { ...options, mimeType: this._mimeType } : options);
    } catch {
      try {
        recorder = new MediaRecorder(this._stream); // some browsers reject bitrate/mime options
      } catch {
        this._fail({ code: 'recorder_failed', message: 'Recording could not be started in this browser.' });
        return;
      }
    }

    this._chunks = [];
    this._bytes = 0;
    this._stopReason = '';
    this._recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (recorder !== this._recorder || !event.data || event.data.size === 0) return;
      this._chunks.push(event.data);
      this._bytes += event.data.size;
      if (this._bytes > this._maxBytes) this.stop('too_large');
    };
    recorder.onerror = () => {
      if (recorder !== this._recorder) return;
      this._discardRecording();
      this._fail({ code: 'recorder_failed', message: 'The recording failed. Please try again.' });
    };
    recorder.onstop = () => {
      if (recorder === this._recorder) this._finalize();
    };

    try {
      recorder.start(TIMESLICE_MS);
    } catch {
      this._discardRecording();
      this._fail({ code: 'recorder_failed', message: 'Recording could not be started in this browser.' });
      return;
    }

    this._startedAt = this._env.now();
    this._stoppedAt = 0;
    this._set({ status: 'recording', elapsedSeconds: 0, notice: '', error: null });
    this._timer = this._env.setInterval(() => this._tick(), TICK_MS);
  }

  _tick() {
    const elapsed = (this._env.now() - this._startedAt) / 1000;
    if (elapsed >= this._maxSeconds) {
      this.stop('limit'); // automatic stop at the maximum duration
      return;
    }
    const whole = Math.floor(elapsed);
    if (whole !== this._snapshot.elapsedSeconds) this._set({ elapsedSeconds: whole });
  }

  stop(reason = 'user') {
    if (this._snapshot.status !== 'recording' || !this._recorder) return;
    if (!this._stopReason) this._stopReason = reason;
    this._stoppedAt = this._env.now();
    this._clearTimer();
    try {
      if (this._recorder.state !== 'inactive') {
        this._recorder.stop(); // the last chunk and onstop follow asynchronously
        return;
      }
    } catch {
      // fall through and finish with whatever was recorded
    }
    this._finalize();
  }

  _finalize() {
    const recorder = this._recorder;
    const reason = this._stopReason;
    const chunks = this._chunks;
    const type = recorder?.mimeType || this._mimeType || chunks[0]?.type || '';
    const seconds = Math.max(0, ((this._stoppedAt || this._env.now()) - this._startedAt) / 1000);

    this._recorder = null;
    this._chunks = [];
    this._bytes = 0;
    this._clearTimer();
    this._releaseStream(); // camera and microphone off

    const blob = chunks.length > 0 ? new Blob(chunks, { type }) : null;

    if (reason === 'too_large' || (blob && blob.size > this._maxBytes)) {
      this._fail({
        code: 'too_large',
        message: 'This recording is larger than the 2 GiB upload limit. Please record a shorter answer.',
      });
      return;
    }
    if (!blob || blob.size === 0) {
      this._fail({ code: 'empty', message: 'Nothing was recorded. Please check your camera and microphone and try again.' });
      return;
    }

    let notice = '';
    if (reason === 'limit') notice = 'You reached the maximum recording length. You can review and submit it, or record again.';
    if (reason === 'disconnected') {
      notice = 'Your camera or microphone was disconnected, so the recording stopped early. Review it, or record again.';
    }
    this._set({
      status: 'recorded',
      blob,
      mimeType: type,
      durationSeconds: Math.round(Math.min(seconds, this._maxSeconds) * 10) / 10,
      elapsedSeconds: Math.floor(Math.min(seconds, this._maxSeconds)),
      notice,
      error: null,
    });
  }

  // Throws the recording away and asks for the camera again (the "Re-record" button).
  retake() {
    this._discardRecording();
    this._set({ ...INITIAL });
    return this.requestAccess();
  }

  // Called when the component unmounts or the page is left: stops everything and invalidates pending prompts.
  release() {
    this._generation += 1;
    this._discardRecording();
    this._set({ ...INITIAL });
  }

  // ----- internals -----
  _onTrackEnded() {
    const { status } = this._snapshot;
    if (status === 'recording') {
      this.stop('disconnected'); // keep what was recorded so far
    } else if (status === 'ready') {
      this._releaseStream();
      this._fail({
        code: 'device_lost',
        message: 'Your camera or microphone was disconnected. Reconnect it and try again.',
      });
    }
  }

  _fail(error) {
    this._releaseStream();
    this._set({ ...INITIAL, status: 'error', error });
  }

  _discardRecording() {
    const recorder = this._recorder;
    this._recorder = null; // handlers ignore events from a recorder that is no longer current
    if (recorder) {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // already stopped
      }
    }
    this._chunks = [];
    this._bytes = 0;
    this._clearTimer();
    this._releaseStream();
  }

  _releaseStream() {
    const stream = this._stream;
    this._stream = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.removeEventListener('ended', this._onTrackEnded));
      stopStream(stream);
    }
    if (this._snapshot.stream) this._snapshot = { ...this._snapshot, stream: null };
  }

  _clearTimer() {
    if (this._timer !== null) this._env.clearInterval(this._timer);
    this._timer = null;
  }
}
