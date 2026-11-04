import axios from 'axios';
import api from './api.js';

// Public endpoints (no login) and employee endpoints for responses.

// A long video can take a long time on a slow connection, so uploads have no fixed time limit
// (the default 8 second API timeout would cancel them). The user can still cancel or leave the page.
const UPLOAD_TIMEOUT_MS = 0;

const enc = encodeURIComponent;

// Step 1 of an S3 submission: validates everything on the server and returns a presigned POST for ONE object.
// Resolves { alreadySubmitted: true } for a retry whose earlier attempt was already completed.
export const initiateUpload = async (token, body, { signal } = {}) =>
  (await api.post(`/public/${enc(token)}/uploads`, body, { signal })).data;

// Step 2: the browser sends the video straight to S3. This uses a plain axios call on purpose: the app's cookie-
// sending client must NOT be used for S3 (no cookie belongs there, and credentials conflict with S3's CORS rules).
// The form fields must be sent exactly as returned, with the file as the LAST field.
export async function uploadToS3(upload, blob, { onProgress, signal } = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', blob);
  return axios.post(upload.url, form, {
    withCredentials: false,
    timeout: UPLOAD_TIMEOUT_MS,
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    },
  });
}

// Step 3: the server checks the object in S3. Only a 200 from this call means the response was saved.
export const completeUpload = async (token, responseId, completionToken, { signal } = {}) =>
  (await api.post(`/public/${enc(token)}/uploads/${enc(responseId)}/complete`, { completionToken }, { signal })).data;

// Development-only flow (the server runs with STORAGE_PROVIDER=local): the video goes through the API server.
export async function submitLocalResponse(token, { submissionId, name, email, consent, durationSeconds, blob, filename, batchId, batchToken, questionId }, { onProgress, signal } = {}) {
  const form = new FormData();
  form.append('submissionId', submissionId);
  form.append('clientName', name.trim());
  form.append('clientEmail', email.trim());
  form.append('consentAccepted', consent ? 'true' : 'false');
  form.append('durationSeconds', String(durationSeconds));
  if (batchId) { form.append('batchId', batchId); form.append('batchToken', batchToken); form.append('questionId', questionId); }
  form.append('video', blob, filename);
  const res = await api.post(`/public/${enc(token)}/responses`, form, {
    // axios would send FormData as JSON under the instance's default JSON header, so this must be set explicitly;
    // the browser then adds the multipart boundary itself.
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    },
  });
  return res.data;
}

// ----- Employee endpoints (cookie authentication) -----

export const listResponses = async (requestId, { page = 1, limit = 20 } = {}) =>
  (await api.get(`/requests/${enc(requestId)}/responses`, { params: { page, limit } })).data;

// Each returns { kind: 'signed', url, ... } (a 60-second S3 URL) or { kind: 'api', path } (development-only local file).
// A signed URL must be requested fresh every time it is used; the API marks these responses as not cacheable.
export const getPlayback = async (responseId) => (await api.get(`/responses/${enc(responseId)}/play`)).data;
export const getDownload = async (responseId) => (await api.get(`/responses/${enc(responseId)}/download`)).data;

// Absolute URL of an API path (used only for the development-only local video endpoint).
export const apiUrl = (path) => `${api.defaults.baseURL}${path}`;

export const finalizeSubmission = async (token, body, {signal} = {}) => (await api.post('/public/' + enc(token) + '/submissions', body, {signal, timeout: 30000})).data;
export const submissionZipUrl = (requestId, batchId) => apiUrl('/requests/' + enc(requestId) + '/submissions/' + enc(batchId) + '/download');
