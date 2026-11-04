import { EMAIL_MAX, NAME_MAX } from '../constants.js';

// Client-side checks for the response form. They give instant feedback only: the backend validates everything
// again and is the real authority.

const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function validateName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) return 'Please enter your name';
  if (name.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters`;
  return '';
}

export function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Please enter your email address';
  if (email.length > EMAIL_MAX) return `Email must be at most ${EMAIL_MAX} characters`;
  const local = email.split('@')[0];
  const validLocal = local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
  if (!EMAIL_PATTERN.test(email) || !validLocal) return 'Enter a valid email address, like name@example.com';
  return '';
}

export function validateConsent(checked) {
  return checked ? '' : 'You must give consent before submitting';
}

// Returns { name, email, consent } with an error string for each invalid field (empty string = valid).
export function validateClientForm({ name, email, consent }) {
  return { name: validateName(name), email: validateEmail(email), consent: validateConsent(consent) };
}

export const hasErrors = (errors) => Object.values(errors).some(Boolean);

// Maps the backend's field names onto the form's field names.
export function mapServerFieldErrors(details = {}) {
  const mapped = {};
  if (details.clientName) mapped.name = details.clientName;
  if (details.clientEmail) mapped.email = details.clientEmail;
  if (details.consentAccepted) mapped.consent = details.consentAccepted;
  return mapped;
}

// RFC 4122 version 4 id. crypto.randomUUID needs a secure context; the fallback covers older browsers.
export function createSubmissionId() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
