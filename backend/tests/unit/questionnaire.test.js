require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const {validateCreateInput, validateUpdateInput} = require('../../services/requestValidation');
const {validateAnswerContext, digest} = require('../../services/questionnaire');
const {generateToken, tokenCandidates, isValidTokenFormat} = require('../../services/linkTokenService');
const {Request} = require('../../models');
const crypto = require('crypto');
const body = () => ({title:'Interview',clientName:'Saurabh Shinde',microsite:'it-tech-pulse',questions:[{text:'First?'},{text:'Second?'}]});

test('multi-question requests validate required client, microsite and separate questions',()=>{
  const valid=validateCreateInput(body());
  assert.equal(valid.questions.length,2);
  assert.equal(valid.question,'First?');
  for(const change of [{clientName:''},{microsite:'unknown'},{questions:[]},{questions:[{text:''}]},{questions:Array(31).fill({text:'Q'})}])assert.throws(()=>validateCreateInput({...body(),...change}),{statusCode:400});
});
test('question ids survive edits and duplicate ids are rejected',()=>{
  const id='64b7f0c2a1b2c3d4e5f60718';
  const update=validateUpdateInput({questions:[{id,text:'Updated?'}]});
  assert.equal(update.set.questions[0]._id,id);
  assert.throws(()=>validateUpdateInput({questions:[{id,text:'Q'},{id,text:'Q2'}]}));
});
test('answer authorization binds the question, batch and secret; no secret is stored directly',()=>{
  const doc=new Request({...validateCreateInput(body()),createdBy:'64b7f0c2a1b2c3d4e5f60718'});
  const raw=crypto.randomBytes(32).toString('base64url');
  const fields={questionId:String(doc.questions[0]._id),batchId:crypto.randomUUID(),batchToken:raw};
  const result=validateAnswerContext(doc,fields);
  assert.equal(result.questionText,'First?');assert.equal(result.batchTokenHash,digest(raw));assert.notEqual(result.batchTokenHash,raw);
  assert.throws(()=>validateAnswerContext(doc,{...fields,questionId:'not-a-question'}));
  assert.throws(()=>validateAnswerContext(doc,{...fields,batchToken:'bad'}));
});
test('short links have exactly two suffix digits and collision search covers all 100 choices',()=>{
  const link=generateToken('Saurabh Shinde');
  assert.match(link,/^saurabhshinde[0-9]{2}$/);assert.equal(isValidTokenFormat(link),true);
  const candidates=tokenCandidates('Saurabh Shinde');assert.equal(new Set(candidates).size,100);
  assert.ok(candidates.includes('saurabhshinde00'));assert.ok(candidates.includes('saurabhshinde99'));
  assert.equal(isValidTokenFormat(generateToken()),true,'old long links remain valid');
});
