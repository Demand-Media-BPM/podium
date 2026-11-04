import { useCallback, useState } from 'react';
import { select, useRecorderController, useRecorderValue } from './useRecorder.js';
import useResponseSubmission from './useResponseSubmission.js';
import { deriveStage } from '../utils/clientStage.js';
import { mapServerFieldErrors } from '../utils/clientForm.js';

// All the state of the client's journey in one place, so the page component only lays things out.
//
//   details   {name, email} once the welcome modal is completed. Held in React state for this visit only:
//             never written to localStorage/sessionStorage, never sent anywhere except with the final submission.
//   stage     DERIVED from details + the real recorder status + whether the client confirmed the review.
//
// Re-recording clears the review confirmation and the consent tick, but keeps name and email.
export default function useClientJourney(token) {
  const recorder = useRecorderController();
  const submission = useResponseSubmission(token);

  const [details, setDetails] = useState(null); // { name, email } | null
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);

  const status = useRecorderValue(recorder, select.status);
  const blob = useRecorderValue(recorder, select.blob);
  const mimeType = useRecorderValue(recorder, select.mimeType);
  const durationSeconds = useRecorderValue(recorder, select.durationSeconds);
  const notice = useRecorderValue(recorder, select.notice);

  const hasRecording = status === 'recorded' && Boolean(blob) && blob.size > 0;
  const stage = deriveStage({ detailsConfirmed: Boolean(details), recorderStatus: status, hasRecording, reviewConfirmed });

  const completeWelcome = useCallback((values) => {
    setDetails(values);
    setWelcomeOpen(false);
  }, []);

  const rerecord = useCallback(() => {
    setReviewConfirmed(false);
    setConsent(false);
    submission.reset();
    recorder.retake();
  }, [recorder, submission]);

  const submit = useCallback(async () => {
    if (!details || !hasRecording) return;
    await submission.submit({
      blob,
      name: details.name,
      email: details.email,
      consent,
      durationSeconds,
      mimeType,
    });
  }, [blob, consent, details, durationSeconds, hasRecording, mimeType, submission]);

  // The server validates everything again. If it rejects the name or email, send the client back to correct them.
  const serverFieldErrors = mapServerFieldErrors(submission.fieldErrors);
  const serverError = serverFieldErrors.name || serverFieldErrors.email || serverFieldErrors.consent || '';

  return {
    recorder,
    submission,
    details,
    welcomeOpen,
    openWelcome: () => setWelcomeOpen(true),
    completeWelcome,
    stage,
    hasRecording,
    blob,
    durationSeconds,
    notice,
    consent,
    setConsent,
    reviewConfirmed,
    confirmReview: () => setReviewConfirmed(true),
    backToReview: () => setReviewConfirmed(false),
    rerecord,
    submit,
    serverError,
  };
}
