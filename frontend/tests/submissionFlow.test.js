import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/services/submissionFlow.js';
import { describeSubmitError } from '../src/utils/submitError.js';
import { fakeDeps, httpError, run } from './helpers/fakeSubmission.js';

test('happy path: initiate, upload to S3, then complete (in that order) and only then success', async () => {
  const { deps, calls } = fakeDeps();
  const result = await run(deps, createSession('sub-1'));
  assert.deepEqual(calls.map((c) => c[0]), ['initiate', 'upload', 'complete']);
  assert.deepEqual(result, { duplicate: false });
  assert.equal(calls[0][1].submissionId, 'sub-1');
  assert.equal(calls[0][1].fileSize, 5000, 'the real byte length is declared');
  assert.equal(calls[0][1].clientName, 'Carla', 'trimmed');
  assert.equal(calls[0][1].consentAccepted, true);
  assert.deepEqual(calls[2].slice(1), ['r1', 'tok1']);
});

test('success is NOT reported when completion fails', async () => {
  const { deps } = fakeDeps({ completeUpload: async () => { throw httpError(500); } });
  await assert.rejects(run(deps, createSession('s')));
});

test('progress goes from 0 to 100 and reaches 100 only after completion', async () => {
  const seen = [];
  const { deps } = fakeDeps();
  await run(deps, createSession('s'), (p) => seen.push(p));
  assert.equal(seen[0], 0);
  assert.equal(seen.at(-1), 100);
  assert.ok(seen.every((p) => p >= 0 && p <= 100));
  assert.equal(seen.indexOf(100), seen.length - 1, '100 appears only at the very end');
});

test('retry after the S3 upload failed: asks again with the SAME submission id and uploads again', async () => {
  let failOnce = true;
  const { deps, calls } = fakeDeps({
    uploadToS3: async () => {
      calls.push(['upload']);
      if (failOnce) {
        failOnce = false;
        throw new Error('Network Error');
      }
    },
  });
  const session = createSession('same-id');
  await assert.rejects(run(deps, session));
  assert.equal(session.uploaded, false);
  await run(deps, session);
  const initiates = calls.filter((c) => c[0] === 'initiate');
  assert.equal(initiates.length, 2);
  assert.ok(initiates.every((c) => c[1].submissionId === 'same-id'), 'the submission id never changes for one recording');
});

test('retry after completion failed (video already in S3): does NOT upload again, only completes', async () => {
  let failOnce = true;
  const { deps, calls } = fakeDeps({
    completeUpload: async (t, id, tok) => {
      calls.push(['complete', id, tok]);
      if (failOnce) {
        failOnce = false;
        throw new Error('Network Error');
      }
      return { success: true, duplicate: false };
    },
  });
  const session = createSession('s');
  await assert.rejects(run(deps, session));
  assert.equal(session.uploaded, true);
  await run(deps, session);
  assert.deepEqual(calls.map((c) => c[0]), ['initiate', 'upload', 'complete', 'complete']);
});

test('if S3 reports the object missing at completion, the next attempt uploads again', async () => {
  const { deps, calls } = fakeDeps({
    completeUpload: async () => {
      calls.push(['complete']);
      throw httpError(409, 'UPLOAD_MISSING');
    },
  });
  const session = createSession('s');
  await assert.rejects(run(deps, session));
  assert.equal(session.uploaded, false);
  await assert.rejects(run(deps, session));
  assert.equal(calls.filter((c) => c[0] === 'upload').length, 2);
});

test('an upload completed earlier (lost confirmation) is reported as done without uploading again', async () => {
  const { deps, calls } = fakeDeps({ initiateUpload: async () => ({ alreadySubmitted: true }) });
  assert.deepEqual(await run(deps, createSession('s')), { duplicate: true });
  assert.deepEqual(calls, []);
});

test('an S3 refusal becomes a generic, retryable error that never exposes S3 details', async () => {
  const xml = '<Error><Code>AccessDenied</Code></Error>';
  const { deps } = fakeDeps({ uploadToS3: async () => { throw Object.assign(new Error('x'), { response: { status: 403, data: xml } }); } });
  await assert.rejects(run(deps, createSession('s')), (err) => {
    const described = describeSubmitError(err);
    assert.equal(described.retryable, true);
    assert.doesNotMatch(described.message, /AccessDenied|<Error>/);
    return true;
  });
});

test('validation errors from initiate are passed through and nothing is uploaded', async () => {
  const { deps, calls } = fakeDeps({ initiateUpload: async () => { throw httpError(400, 'VALIDATION_ERROR'); } });
  await assert.rejects(run(deps, createSession('s')));
  assert.deepEqual(calls, []);
});

test('development fallback happens only when the server answers 404 NOT_FOUND (local storage mode)', async () => {
  const { deps, calls } = fakeDeps({ initiateUpload: async () => { throw httpError(404, 'NOT_FOUND'); } });
  assert.deepEqual(await run(deps, createSession('s')), { duplicate: false });
  assert.deepEqual(calls.map((c) => c[0]), ['local']);
  // An unavailable link is a real error, not a reason to fall back.
  const second = fakeDeps({ initiateUpload: async () => { throw httpError(404, 'LINK_UNAVAILABLE'); } });
  await assert.rejects(run(second.deps, createSession('s')));
  assert.deepEqual(second.calls, []);
});

test('question metadata reaches the upload authorization and local retries retain the response id', async () => {
 const {runSubmission,createSession}=await import('../src/services/submissionFlow.js');
 const {fakeDeps,input,httpError}=await import('./helpers/fakeSubmission.js');
 const values={...input(),batchId:'batch',batchToken:'secret',questionId:'q1'};
 const first=fakeDeps();const session=createSession('submission');
 await runSubmission({token:'link',session,input:values,deps:first.deps});
 assert.equal(first.calls[0][1].questionId,'q1');assert.equal(first.calls[0][1].batchToken,'secret');
 const local=fakeDeps({initiateUpload:async()=>{throw httpError(404,'NOT_FOUND');},submitLocalResponse:async()=>({responseId:'local-answer',duplicate:true})});
 const retry=createSession('submission');const result=await runSubmission({token:'link',session:retry,input:values,deps:local.deps});
 assert.equal(retry.responseId,'local-answer');assert.equal(result.duplicate,true);
});
