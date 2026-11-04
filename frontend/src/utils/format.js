const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateTimeFormat.format(date);
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}

// 75 -> "1:15". Used for recording timers and clip lengths.
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// <input type="datetime-local"> uses local time without a zone ("2026-10-20T14:30").
export function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Earliest value the picker offers (now, rounded up to the next minute).
export function nowLocalInput() {
  return isoToLocalInput(new Date(Date.now() + 60000).toISOString());
}

// Turns an Axios error into { message, fieldErrors, status } using only server-provided safe messages.
export function getApiError(error, fallback = 'Something went wrong. Please try again.') {
  const response = error?.response;
  if (!response) {
    return { message: 'Cannot reach the server. Check your connection and try again.', fieldErrors: {}, status: 0 };
  }
  const data = response.data || {};
  const fieldErrors = data.details && typeof data.details === 'object' ? data.details : {};
  let message = typeof data.message === 'string' && data.message ? data.message : fallback;
  if (response.status === 429) message = 'Too many requests. Please wait a moment and try again.';
  if (response.status >= 500) message = fallback;
  return { message, fieldErrors, status: response.status };
}
