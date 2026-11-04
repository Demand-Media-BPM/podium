// The network functions (initiateUpload, uploadToS3, completeUpload, submitLocalResponse from responseApi.js) are passed
// in as `deps`, which keeps this module free of browser-only imports so it can be unit tested in Node.

// The browser side of a submission. Plain JavaScript (no React) so it can be unit tested.
//
//   1. initiate   POST /public/:token/uploads            -> presigned POST for one S3 object + completion token
//   2. upload     POST <S3 url> (the recording)           -> 204 from S3
//   3. complete   POST /public/:token/uploads/:id/complete -> the server verifies the object and saves the response
//
// Success is reported ONLY after step 3 returns. `session` remembers the progress for one recording, so a retry
// after a network failure does not repeat work that already succeeded and never creates a second response:
//   - uploaded && completion token known -> only step 3 is repeated;
//   - otherwise step 1 runs again with the SAME submissionId (the server re-issues a fresh authorization for the
//     same record), then steps 2 and 3.
// Progress is reported as a number from 0 to 100 (initiate = first 3 %, upload = up to 97 %, then saving).

const INITIATE_SHARE = 3;
const UPLOAD_SHARE = 94;

export function createSession(submissionId) {
  return { submissionId, responseId: '', completionToken: '', uploaded: false };
}

// The upload endpoint answers 404 NOT_FOUND (not LINK_UNAVAILABLE) when the server is in development "local" storage
// mode. Only then is the Phase 4 development flow used. In production the server never runs in that mode.
const isLocalModeResponse = (err) => err?.response?.status === 404 && err?.response?.data?.code === 'NOT_FOUND';

// S3 answers with an XML error body, not our JSON. Turn any answer from S3 into a retryable, generic error:
// the usual causes are an expired authorization (slow connection) or a rejected size/type.
function asS3Error(err) {
  if (!err?.response) return err; // network failure or cancel: handled by the caller as usual
  return Object.assign(new Error('Upload rejected'), { response: { status: err.response.status, data: { code: 'S3_REJECTED' } } });
}

export async function runSubmission({ token, session, input, deps = {}, onProgress = () => {}, signal }) {
  const d = deps;
  const report = (value) => onProgress(Math.max(0, Math.min(100, Math.round(value))));

  if (!session.uploaded || !session.completionToken) {
    session.uploaded = false;
    report(0);

    let started;
    try {
      started = await d.initiateUpload(
        token,
        {
          submissionId: session.submissionId,
          clientName: input.name.trim(),
          clientEmail: input.email.trim(),
          consentAccepted: input.consent === true,
          durationSeconds: input.durationSeconds,
          mimeType: input.mimeType,
          fileSize: input.blob.size,
          ...(input.batchId ? {batchId: input.batchId, batchToken: input.batchToken, questionId: input.questionId} : {}),
        },
        { signal }
      );
    } catch (err) {
      if (!isLocalModeResponse(err)) throw err;
      // Development only: the server stores videos locally and expects the video itself in one request.
      const local = await d.submitLocalResponse(
        token,
        { submissionId: session.submissionId, ...input, filename: input.filename },
        { signal, onProgress: (fraction) => report(fraction * 100) }
      );
      report(100);
      session.responseId = local?.responseId || '';
      return { duplicate: Boolean(local?.duplicate) };
    }

    if (started.alreadySubmitted) {
      session.responseId = started.responseId || session.responseId;
      report(100);
      return { duplicate: true }; // an earlier attempt was already completed (its confirmation was lost)
    }
    session.responseId = started.responseId;
    session.completionToken = started.completionToken;
    report(INITIATE_SHARE);

    try {
      await d.uploadToS3(started.upload, input.blob, {
        signal,
        onProgress: (fraction) => report(INITIATE_SHARE + fraction * UPLOAD_SHARE),
      });
    } catch (err) {
      throw asS3Error(err);
    }
    session.uploaded = true;
  }

  report(INITIATE_SHARE + UPLOAD_SHARE);
  try {
    const done = await d.completeUpload(token, session.responseId, session.completionToken, { signal });
    report(100);
    return { duplicate: Boolean(done.duplicate) };
  } catch (err) {
    // The object is not in S3 (or was removed): the next attempt must upload again.
    if (err?.response?.data?.code === 'UPLOAD_MISSING') session.uploaded = false;
    throw err;
  }
}
