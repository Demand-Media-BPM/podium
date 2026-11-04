// Must match the backend limits (backend/services/fieldValidators.js and models/Request.js).
export const TITLE_MAX = 150;
export const QUESTION_MAX = 2000;
// New questionnaires share this allowance across all final answers.
export const MAX_DURATION_SECONDS = 3540;

// Phase 4 (client recording). The backend enforces the same limits independently.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const CONSENT_TEXT = 'I consent to the recording, storage, and internal use of my video response.';
// How long videos are kept (S3 lifecycle rule + the app's own deadline). Shown to clients and employees.
export const RETENTION_DAYS = 180;
export const APP_NAME = 'PODIUM';
