const { hasMongo, createClient } = require('../helpers/testServer');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Request, Response } = require('../../models');
const { setup, submit, committedFiles, tempFiles, count } = require('../helpers/uploadSetup');
const { buildMultipart, VALID_FIELDS } = require('../helpers/videoFixtures');

const skip = hasMongo ? false : 'MONGODB_URI is not set - integration tests need a MongoDB connection';

async function withFailingCreate(action) {
  const original = Response.create;
  Response.create = async () => {
    throw new Error('simulated database failure');
  };
  try {
    return await action();
  } finally {
    Response.create = original;
  }
}

test('failure handling (integration)', { skip }, async (t) => {
  const ctx = await setup(t);

  await t.test('if the database write fails, the stored file is removed and no success is returned', async () => {
    const res = await withFailingCreate(() => submit(ctx, buildMultipart({})));
    assert.equal(res.status, 500);
    assert.equal(res.json.success, false);
    assert.ok(!res.text.includes('simulated'), 'internal error text is not leaked');
    assert.equal(await count(), 0);
    assert.deepEqual(committedFiles(), [], 'no orphaned video file');
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('after a failure, retrying with the same submission id works', async () => {
    const fields = VALID_FIELDS();
    assert.equal((await withFailingCreate(() => submit(ctx, buildMultipart({ fields })))).status, 500);
    const retry = await submit(ctx, buildMultipart({ fields }));
    assert.equal(retry.status, 201);
    assert.equal(await count(), 1);
    assert.equal(committedFiles().length, 1);
  });

  await t.test('a request closed while the upload was in progress does not get a response', async () => {
    // Closes the request right after the upload has been read, before the response is saved.
    const original = Response.findOne;
    let closed = false;
    Response.findOne = function patched(...args) {
      if (closed) return original.apply(this, args);
      closed = true;
      return Request.updateOne({ _id: ctx.requestId }, { status: 'closed' }).then(() => original.apply(this, args));
    };
    try {
      assert.equal((await submit(ctx, buildMultipart({}))).status, 404);
    } finally {
      Response.findOne = original;
      await Request.updateOne({ _id: ctx.requestId }, { status: 'active' });
    }
    assert.equal(await count(), 1, 'still only the response from the previous test');
    assert.equal(committedFiles().length, 1);
    assert.deepEqual(tempFiles(), []);
  });

  await t.test('uploads do not interfere with the employee API and session', async () => {
    assert.equal((await createClient(ctx.baseUrl).get('/api/requests')).status, 401);
    assert.equal((await ctx.client.get('/api/auth/me')).status, 200);
  });
});
