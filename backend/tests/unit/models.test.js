require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { User, Request, Response } = require('../../models');
const { redactUri } = require('../../config/db');

test('User: required fields are enforced', () => {
  const error = new User({}).validateSync();
  assert.ok(error.errors.name && error.errors.email && error.errors.passwordHash);
});

test('User: email is lowercased and trimmed, role defaults to employee, isActive to true', () => {
  const user = new User({ name: 'A', email: '  Jane@Example.COM ', passwordHash: 'hash' });
  assert.equal(user.email, 'jane@example.com');
  assert.equal(user.role, 'employee');
  assert.equal(user.isActive, true);
  assert.equal(user.validateSync(), undefined);
});

test('User: role must be admin or employee', () => {
  const error = new User({ name: 'A', email: 'a@b.co', passwordHash: 'h', role: 'superuser' }).validateSync();
  assert.ok(error.errors.role);
});

test('User: passwordHash is excluded from queries by default and from JSON output', () => {
  assert.equal(User.schema.path('passwordHash').options.select, false);
  const json = new User({ name: 'A', email: 'a@b.co', passwordHash: 'secret-hash' }).toJSON();
  assert.ok(!('passwordHash' in json));
});

test('User: has a unique email index and timestamps', () => {
  assert.ok(User.schema.indexes().some(([fields, opts]) => fields.email === 1 && opts.unique === true));
  assert.ok(User.schema.path('createdAt') && User.schema.path('updatedAt'));
});

test('Request: defaults and status enum', () => {
  const request = new Request({ title: 'T', question: 'Q', createdBy: '64b7f0c2a1b2c3d4e5f60718' });
  assert.equal(request.status, 'active');
  assert.equal(request.maxDurationSeconds, 3540);
  assert.equal(request.validateSync(), undefined);
  assert.ok(new Request({ title: 'T', question: 'Q', createdBy: '64b7f0c2a1b2c3d4e5f60718', status: 'x' }).validateSync().errors.status);
});

test('Request: title and question are required; tokenHash is optional and hidden by default', () => {
  const error = new Request({}).validateSync();
  assert.ok(error.errors.title && error.errors.question);
  assert.equal(error.errors.tokenHash, undefined);
  assert.equal(Request.schema.path('tokenHash').options.select, false);
});

test('Request: tokenHash has a unique index limited to documents that have one', () => {
  const entry = Request.schema.indexes().find(([fields]) => fields.tokenHash === 1);
  assert.ok(entry);
  assert.equal(entry[1].unique, true);
  assert.ok(entry[1].partialFilterExpression);
});

test('Response: status enum and defaults', () => {
  const response = new Response({ requestId: '64b7f0c2a1b2c3d4e5f60718' });
  assert.equal(response.status, 'pending_upload');
  assert.equal(response.consentAccepted, false);
  for (const status of ['pending_upload', 'submitted', 'expired', 'failed']) {
    response.status = status;
    assert.equal(response.validateSync(), undefined);
  }
  response.status = 'deleted';
  assert.ok(response.validateSync().errors.status);
});

test('Response: has no TTL index, so records are never auto-deleted by MongoDB', () => {
  const hasTtl = Response.schema.indexes().some(([, opts]) => opts && opts.expireAfterSeconds !== undefined);
  assert.equal(hasTtl, false);
  assert.ok(Response.schema.path('deleteAt'));
});

test('Response: submissionId must be a UUID and is unique per request', () => {
  const ok = new Response({ requestId: '64b7f0c2a1b2c3d4e5f60718', submissionId: '3f2b8a52-9c1e-4d7b-8a31-5e6f7a8b9c0d' });
  assert.equal(ok.validateSync(), undefined);
  const bad = new Response({ requestId: '64b7f0c2a1b2c3d4e5f60718', submissionId: 'not-a-uuid' });
  assert.ok(bad.validateSync().errors.submissionId);
  const entry = Response.schema.indexes().find(([fields]) => fields.submissionId === 1 && fields.requestId === 1);
  assert.ok(entry && entry[1].unique === true && entry[1].partialFilterExpression);
});

test('Response: videoKey is hidden from queries by default', () => {
  assert.equal(Response.schema.path('videoKey').options.select, false);
});

test('redactUri removes credentials from connection strings in messages', () => {
  const message = redactUri('failed for mongodb+srv://admin:p%40ss@cluster0.example.net/ (auth)');
  assert.ok(!message.includes('admin'));
  assert.ok(!message.includes('p%40ss'));
  assert.ok(message.includes('cluster0.example.net'));
});
