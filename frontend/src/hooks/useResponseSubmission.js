import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, runSubmission } from '../services/submissionFlow.js';
import { completeUpload, initiateUpload, submitLocalResponse, uploadToS3 } from '../services/responseApi.js';

const NETWORK = { initiateUpload, uploadToS3, completeUpload, submitLocalResponse };
import { createSubmissionId } from '../utils/clientForm.js';
import { describeSubmitError } from '../utils/submitError.js';
import { markSubmissionDone } from '../utils/thankYou.js';
import { extensionForMime } from '../utils/mediaSupport.js';

// Sends the recording (browser -> S3 -> server verification) and moves to /thank-you ONLY after the server confirms
// the response was saved (see services/submissionFlow.js for the three steps).
//
// Duplicate protection:
//  - a ref blocks a second submit while one is in flight (state alone can lag behind a fast double click);
//  - one "session" (submission id + upload progress) lives per recording, so every retry of the same recording
//    reuses the same submission id and the server returns the existing response instead of creating another;
//  - a new recording (re-record) gets a new session and a new id.
export default function useResponseSubmission(token) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'idle', progress: 0, error: '', retryable: false, fieldErrors: {} });
  const inFlight = useRef(false);
  const abortRef = useRef(null);
  const sessionRef = useRef({ blob: null, session: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort(); // leaving the page cancels an upload in progress
    };
  }, []);

  const submit = useCallback(
    async ({ blob, name, email, consent, durationSeconds, mimeType }) => {
      if (inFlight.current || !blob) return;
      inFlight.current = true;

      if (sessionRef.current.blob !== blob) sessionRef.current = { blob, session: createSession(createSubmissionId()) };
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'uploading', progress: 0, error: '', retryable: false, fieldErrors: {} });

      try {
        await runSubmission({
          token,
          deps: NETWORK,
          session: sessionRef.current.session,
          input: { blob, name, email, consent, durationSeconds, mimeType, filename: `response.${extensionForMime(mimeType)}` },
          signal: controller.signal,
          onProgress: (progress) => mounted.current && setState((s) => (s.status === 'uploading' ? { ...s, progress } : s)),
        });
        // Confirmed by the server: only now is it a success.
        markSubmissionDone();
        if (mounted.current) setState((s) => ({ ...s, status: 'done', progress: 100 }));
        navigate('/thank-you', { replace: true });
      } catch (err) {
        if (!mounted.current) return;
        const { message, retryable, fieldErrors, restart } = describeSubmitError(err);
        // The server closed or rejected that attempt for good: the next attempt starts a fresh submission.
        if (restart) sessionRef.current = { blob: null, session: null };
        setState({ status: 'error', progress: 0, error: message, retryable, fieldErrors });
      } finally {
        inFlight.current = false;
        abortRef.current = null;
      }
    },
    [navigate, token]
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => setState({ status: 'idle', progress: 0, error: '', retryable: false, fieldErrors: {} }), []);

  return { ...state, uploading: state.status === 'uploading', submit, cancel, reset };
}
