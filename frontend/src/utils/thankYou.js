// Proof that a submission really succeeded, kept in sessionStorage for the Thank You page.
// It holds only a flag and a timestamp: no name, email, token or response data, and nothing goes in the URL.
// Anyone can set this value from the browser console, so it only prevents an accidental "success" message when
// the page is opened directly; it is not a security control.
const KEY = 'vrt_submission_done';
const MAX_AGE_MS = 30 * 60 * 1000;

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null; // storage can be blocked
  }
}

export function markSubmissionDone(now = Date.now()) {
  storage()?.setItem(KEY, String(now));
}

export function hasRecentSubmission(now = Date.now()) {
  const raw = storage()?.getItem(KEY);
  const when = Number(raw);
  return Boolean(raw) && Number.isFinite(when) && now - when >= 0 && now - when <= MAX_AGE_MS;
}

export function clearSubmissionDone() {
  storage()?.removeItem(KEY);
}
