require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hasMongo } = require('../helpers/testServer');
const { setupAccess } = require('../helpers/accessSetup');
const { Response, Submission } = require('../../models');

test('response groups paginate as complete submissions with stable numbers and original question order', {skip: !hasMongo}, async t => {
  const ctx = await setupAccess(t);
  const created = await ctx.alice.client.post('/api/requests', {
    title: 'Grouped interviews', clientName: 'Same client', microsite: 'it-tech-pulse',
    questions: [{text: 'First question?'}, {text: 'Second question?'}],
  });
  assert.equal(created.status, 201, created.text);
  const requestId = created.json.request.id;
  const base = {requestId, clientName:'Same client', clientEmail:'client@example.com', status:'submitted', consentAccepted:true, storageProvider:'local', durationSeconds:1, deleteAt:new Date(Date.now()+86400000)};
  const legacy = await Response.create({...base, submittedAt:new Date('2026-01-01')});
  const makeGroup = async (day, expired = false) => {
    const batchId = crypto.randomUUID();
    // Deliberately insert videos in reverse question order and give Q2 the newer timestamp.
    const q2 = await Response.create({...base,batchId,questionId:'q2',questionText:'Second question?',submittedAt:new Date('2026-02-'+day+'T12:00:00Z'),...(expired ? {status:'expired'} : {})});
    const q1 = await Response.create({...base,batchId,questionId:'q1',questionText:'First question?',submittedAt:new Date('2026-02-'+day+'T11:00:00Z')});
    await Submission.create({requestId,batchId,tokenHash:'a'.repeat(64),responseIds:[q1._id,q2._id],createdAt:new Date('2026-02-'+day+'T13:00:00Z')});
    return {batchId, ids:[q1.id,q2.id]};
  };
  const first = await makeGroup('01');
  const second = await makeGroup('02');
  const third = await makeGroup('03', true);
  await Response.create({...base,batchId:crypto.randomUUID(),questionText:'Hidden unfinished upload'});
  const path='/api/requests/'+requestId+'/responses';
  const fetchPage = async page => {
    const result = await ctx.alice.client.get(path+'?page='+page+'&limit=1');
    assert.equal(result.status,200,result.text);return result.json;
  };
  const page1 = await fetchPage(1);
  assert.equal(page1.pagination.total,4,'three questionnaires and one legacy submission');
  assert.equal(page1.pagination.totalPages,4);
  assert.equal(page1.submissions.length,1);
  assert.equal(page1.submissions[0].number,1);
  assert.equal(page1.submissions[0].batchId,null);
  assert.equal(page1.responses[0].id,legacy.id);
  const page2 = await fetchPage(2);
  assert.equal(page2.submissions[0].number,2);
  assert.equal(page2.submissions[0].batchId,first.batchId);
  assert.equal(page2.submissions[0].downloadable,true);
  assert.deepEqual(page2.responses.map(r=>r.id),first.ids,'a whole two-video response fits a one-submission page');
  assert.deepEqual(page2.submissions[0].responses.map(r=>r.questionText),['First question?','Second question?']);
  const page3 = await fetchPage(3);
  assert.equal(page3.submissions[0].number,3);assert.deepEqual(page3.responses.map(r=>r.id),second.ids);
  const page4 = await fetchPage(4);
  assert.equal(page4.submissions[0].number,4);assert.equal(page4.submissions[0].batchId,third.batchId);
  assert.equal(page4.submissions[0].downloadable,false,'an expired answer disables ZIP');
  const added = await makeGroup('04');
  const latest = await fetchPage(5);assert.equal(latest.submissions[0].number,5);assert.equal(latest.submissions[0].batchId,added.batchId);
  assert.equal((await fetchPage(3)).submissions[0].number,3,'old response keeps its number after a new arrival');
  assert.deepEqual((await fetchPage(99)).submissions,[]);
  assert.equal((await ctx.bob.client.get(path)).status,404);
  assert.equal((await ctx.anon.get(path)).status,401);
  assert.equal((await ctx.admin.client.get(path)).json.pagination.total,5);
  const json=JSON.stringify(latest);assert.ok(!json.includes('tokenHash'));assert.ok(!json.includes('Hidden unfinished upload'));
});
