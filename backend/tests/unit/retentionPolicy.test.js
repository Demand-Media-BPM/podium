require('../helpers/setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const {retentionDeadline} = require('../../services/retentionPolicy');
const {serializeResponse, effectiveStatus} = require('../../services/responseService');
const DAY = 86400000;
const start = new Date('2026-01-01T00:00:00Z');

test('unmarked 180-day records use the original storage clock with a 60-day deadline',()=>{
  const old = {submittedAt:start,deleteAt:new Date(+start + 180*DAY)};
  assert.equal(+retentionDeadline(old),+start+60*DAY);
  const migrated = {...old,submittedAt:new Date(+start-40*DAY)};
  assert.equal(+retentionDeadline(migrated),+start+60*DAY,'migration must not substitute the earlier submission date for the storage date');
});
test('current deadlines, earlier deadlines and missing legacy deadlines are handled without extension',()=>{
  const current = {retentionDays:60,submittedAt:start,deleteAt:new Date(+start+60*DAY)};
  assert.equal(+retentionDeadline(current),+current.deleteAt);
  assert.equal(+retentionDeadline({...current,deleteAt:start}),+start);
  const shorter = {retentionDays:30,deleteAt:new Date(+start+30*DAY)};
  assert.equal(+retentionDeadline(shorter),+shorter.deleteAt);
  assert.equal(+retentionDeadline({submittedAt:start}),+start+60*DAY);
  assert.equal(retentionDeadline({}),null);
});
test('API metadata and availability agree on legacy expiry before the database alignment runs',()=>{
  const old = {id:'r',status:'submitted',storageProvider:'s3',submittedAt:start,deleteAt:new Date(+start+180*DAY)};
  const now = new Date(+start+60*DAY);
  const result = serializeResponse(old,now);
  assert.equal(+result.deleteAt,+start+60*DAY);
  assert.equal(result.effectiveStatus,'expired');assert.equal(result.playable,false);
  assert.equal(effectiveStatus(old,new Date(+now-1)),'submitted');
  assert.equal(effectiveStatus({...old,status:'expired'},start),'expired');
});
