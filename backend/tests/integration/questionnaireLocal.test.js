require('../helpers/setupEnv');
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {hasMongo,postMultipart}=require('../helpers/testServer');
const {setup}=require('../helpers/uploadSetup');
const {buildMultipart,VALID_FIELDS}=require('../helpers/videoFixtures');
test('local questionnaire: question identity, retry, finalization, playback and ZIP',{skip:!hasMongo},async t=>{
 const ctx=await setup(t);
 const created=await ctx.client.post('/api/requests',{title:'Local',clientName:'Local Client',microsite:'health-tech-pulse',questions:[{text:'Local question?'}]});assert.equal(created.status,201,created.text);
 const token=created.json.url.split('/').pop(),requestId=created.json.request.id,batchId=crypto.randomUUID(),batchToken=crypto.randomBytes(32).toString('base64url');
 const parts=buildMultipart({fields:{...VALID_FIELDS(),batchId,batchToken,questionId:created.json.request.questions[0].id}});
 const upload=await postMultipart(ctx.baseUrl,'/api/public/'+token+'/responses',parts);assert.equal(upload.status,201,upload.text);assert.ok(upload.json.responseId);
 const retry=await postMultipart(ctx.baseUrl,'/api/public/'+token+'/responses',parts);assert.equal(retry.json.responseId,upload.json.responseId);
 assert.equal((await ctx.client.get('/api/requests/'+requestId+'/responses')).json.responses.length,0);
 const done=await ctx.client.post('/api/public/'+token+'/submissions',{batchId,batchToken,answers:[upload.json.responseId]});assert.equal(done.status,200,done.text);
 assert.equal((await ctx.client.get('/api/responses/'+upload.json.responseId+'/play')).status,200);
 const zip=await fetch(ctx.baseUrl+'/api/requests/'+requestId+'/submissions/'+batchId+'/download',{headers:{Cookie:ctx.client.getCookie()}});assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).readUInt32LE(0),0x04034b50);
});
