import { getApiError } from './format.js';

// Turns a failed play/download request into { message, code } for the employee.
// 410 = the video is gone (expired by the 60-day policy, or the file is missing) and retrying will not help.
export function describeVideoAccessError(error) {
  const data = error?.response?.data || {};
  const status = error?.response?.status;
  const code = data.code || '';

  if (code === 'VIDEO_EXPIRED') {
    return { code, message: 'This video has passed its 60-day retention period and has been removed. Only the submission details are kept.' };
  }
  if (code === 'VIDEO_MISSING') {
    return { code, message: 'The video file is no longer available.' };
  }
  if (code === 'LOCAL_VIDEO_UNAVAILABLE') {
    return { code, message: 'This is a local development test recording and cannot be played while the server uses S3. See docs/aws-s3-setup.md to migrate it.' };
  }
  if (status === 404) return { code: 'NOT_FOUND', message: 'This response could not be found, or you do not have access to it.' };
  if (code === 'STORAGE_UNAVAILABLE') {
    return { code, message: 'The video storage is temporarily unavailable. Please try again in a moment.' };
  }
  return { code, message: getApiError(error, 'Could not load the video. Please try again.').message };
}

// True when a response row should offer Play / Download.
export const canAccessVideo = (response) => Boolean(response && response.playable && response.effectiveStatus === 'submitted');
