import { runSubmission } from '../../src/services/submissionFlow.js';

export const httpError = (status, code) => Object.assign(new Error(code || 'x'), { response: { status, data: code ? { code } : {} } });

export const input = () => ({
  blob: { size: 5000 },
  name: ' Carla ',
  email: ' c@x.co ',
  consent: true,
  durationSeconds: 12.5,
  mimeType: 'video/webm',
  filename: 'response.webm',
});

// A fake backend + S3 whose behaviour each test can change. Every call is recorded, in order, in `calls`.
export function fakeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    initiateUpload: async (token, body) => {
      calls.push(['initiate', body]);
      return { alreadySubmitted: false, responseId: 'r1', completionToken: 'tok1', upload: { url: 'https://s3.example/b', fields: { key: 'k' } } };
    },
    uploadToS3: async (upload, blob, { onProgress }) => {
      calls.push(['upload']);
      onProgress?.(0.5);
      onProgress?.(1);
    },
    completeUpload: async (token, id, completion) => {
      calls.push(['complete', id, completion]);
      return { success: true, duplicate: false };
    },
    submitLocalResponse: async () => {
      calls.push(['local']);
    },
    ...overrides,
  };
  return { deps, calls };
}

export const run = (deps, session, onProgress) => runSubmission({ token: 'T', session, input: input(), deps, onProgress });
