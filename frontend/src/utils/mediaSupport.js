// Browser capability checks and error wording for camera/microphone recording.
// Everything here is a pure function of its inputs so it can be unit tested without a browser.

// In order of preference: WebM where supported (Chrome, Edge, Firefox, Android), then MP4 (Safari / iPhone).
// The format is never hardcoded: each browser reports what it can really record.
export const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
];

// 720p is only a preference ("ideal"): devices that cannot do it still work.
export const IDEAL_CONSTRAINTS = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: { echoCancellation: true, noiseSuppression: true },
};
export const BASIC_CONSTRAINTS = { video: true, audio: true };

export function pickRecordingMimeType(MediaRecorderCtor) {
  if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== 'function') return '';
  return RECORDING_MIME_CANDIDATES.find((type) => MediaRecorderCtor.isTypeSupported(type)) || '';
}

// Returns { ok: true } or { ok: false, error: { code, message } }.
export function getRecordingSupport({ mediaDevices, MediaRecorder, isSecureContext } = {}) {
  if (isSecureContext === false) {
    return {
      ok: false,
      error: {
        code: 'insecure',
        message:
          'Recording only works on a secure (HTTPS) connection. Please open this page using the https:// address, or on localhost during development.',
      },
    };
  }
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function' || !MediaRecorder) {
    return {
      ok: false,
      error: {
        code: 'unsupported',
        message:
          'This browser cannot record video. Please use a recent version of Chrome, Edge, Firefox or Safari.',
      },
    };
  }
  return { ok: true };
}

// Turns a getUserMedia failure into a friendly, actionable message.
export function describeMediaError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      code: 'permission_denied',
      message:
        'Camera and microphone access was blocked. Allow access in your browser (usually the camera icon in the address bar), then try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'no_device',
      message: 'No camera or microphone was found. Connect one and try again. Both are required.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      code: 'in_use',
      message:
        'Your camera or microphone could not be started. It may be in use by another app. Close other apps that use it and try again.',
    };
  }
  return { code: 'unknown', message: 'We could not access your camera and microphone. Please try again.' };
}

export function isConstraintError(err) {
  return err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError';
}

export function extensionForMime(type) {
  return /mp4/i.test(type || '') ? 'mp4' : 'webm';
}

export function stopStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}
