// The public response page is a guided journey. The current stage is DERIVED from real state (what the client has
// confirmed and what the recorder holds), never stored separately, so the UI cannot drift out of sync with it.
//
//   details -> record -> review -> submit
export const STAGES = ['details', 'record', 'review', 'submit'];
export const STAGE_LABELS = { details: 'Details', record: 'Record', review: 'Review', submit: 'Submit' };

export function deriveStage({ detailsConfirmed, recorderStatus, hasRecording, reviewConfirmed }) {
  if (!detailsConfirmed) return 'details';
  if (recorderStatus === 'recorded' && hasRecording) return reviewConfirmed ? 'submit' : 'review';
  return 'record';
}

export const stageIndex = (stage) => Math.max(0, STAGES.indexOf(stage));
