// Translates a failed upload into { message, retryable, fieldErrors } for the client.
// Network failures and server errors are retryable with the SAME submission id (safe: the server de-duplicates).
// Problems with the recording or the form itself are not: retrying the same upload would fail again.
export function describeSubmitError(error, fallback = 'We could not submit your response. Please try again.') {
  if (error?.code === 'ERR_CANCELED') return { message: 'Upload cancelled.', retryable: true, fieldErrors: {} };

  const response = error?.response;
  if (!response) {
    return {
      message: 'The upload was interrupted. Please check your internet connection and try again. Your recording is still here.',
      retryable: true,
      fieldErrors: {},
    };
  }

  const data = response.data && typeof response.data === 'object' ? response.data : {};
  const code = data.code;
  const status = response.status;
  const fieldErrors = data.details && typeof data.details === 'object' ? data.details : {};

  // Direct-to-S3 uploads (Phase 5)
  if (code === 'S3_REJECTED') {
    return {
      message: 'The upload was not accepted, possibly because it took too long. Your recording is still here: please try again.',
      retryable: true,
      fieldErrors: {},
    };
  }
  if (code === 'UPLOAD_MISSING') {
    return { message: 'Your video did not arrive completely. Please try submitting again.', retryable: true, fieldErrors: {} };
  }
  if (code === 'UPLOAD_INVALID' || code === 'SUBMISSION_CLOSED') {
    return { message: 'This submission could not be completed. Please press the button to send it again.', retryable: true, fieldErrors: {}, restart: true };
  }
  if (code === 'STORAGE_UNAVAILABLE') {
    return { message: 'The video storage is temporarily unavailable. Please try again in a moment.', retryable: true, fieldErrors: {} };
  }

  if (status === 404 || code === 'LINK_UNAVAILABLE') {
    return { message: 'This link is no longer accepting responses. Please contact the person who sent it to you.', retryable: false, fieldErrors: {} };
  }
  if (status === 413 || code === 'VIDEO_TOO_LARGE') {
    return { message: 'The video is larger than the 2 GiB limit. Please record a shorter answer.', retryable: false, fieldErrors: {} };
  }
  if (status === 415 || code === 'UNSUPPORTED_VIDEO') {
    return { message: 'This video format is not supported. Please record again, or try a different browser.', retryable: false, fieldErrors: {} };
  }
  if (code === 'VIDEO_EMPTY' || code === 'VIDEO_REQUIRED') {
    return { message: 'The recording is empty. Please record again.', retryable: false, fieldErrors: {} };
  }
  if (status === 429) {
    return { message: 'Too many attempts. Please wait a few minutes and try again.', retryable: true, fieldErrors: {} };
  }
  if (status === 400 && code === 'VALIDATION_ERROR') {
    const text = typeof data.message === 'string' && data.message ? data.message : 'Please check the highlighted fields.';
    return { message: text, retryable: false, fieldErrors };
  }
  if (status === 403) {
    return { message: 'This page is not allowed to submit responses. Please use the link you were sent.', retryable: false, fieldErrors: {} };
  }
  return { message: fallback, retryable: true, fieldErrors: {} };
}
