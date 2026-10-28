const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./batch/fixture.cjs');
test('a default-off batch stays on its saved legacy implementation after the flag changes', async t => {
  const f=await fixture(t);
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,f.context,false),'legacy');
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,f.context,true),'legacy');
  assert.equal(await f.db.directorNextEvent.count({where:{type:'production_batch_implementation'}}),1);
});
test('a new enabled batch retains the kernel binding after a restart with the flag off', async t => {
  const f=await fixture(t);
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,f.context,true),'kernel');
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,structuredClone(f.context),false),'kernel');
});
test('an already bound legacy job never migrates into the kernel', async t => {
  const f=await fixture(t);
  await f.db.directorNextEvent.create({data:{id:'batch-1:1',runId:'batch-1',seq:1,type:'chapter_batch_job',payloadJson:JSON.stringify({jobId:'legacy-job'})}});
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,f.context,true),'legacy');
});
test('a legacy start-before-bind crash is recognized by its persisted job owner', async t => {
  const f=await fixture(t);
  await f.db.generationJob.create({data:{id:'legacy-job',novelId:'novel-1',startOrder:1,endOrder:3,status:'running',payload:JSON.stringify({directorNext:{runId:'batch-1'}})}});
  assert.equal(await f.api.chooseProductionBatchImplementation(f.db,f.context,true),'legacy');
});
test('a replaced worker cannot bind a batch by adopting the replacement lease', async t => {
  const f=await fixture(t);
  await f.db.directorNextRunControl.update({where:{runId:'batch-1'},data:{leaseOwner:'worker:2'}});
  await assert.rejects(()=>f.api.chooseProductionBatchImplementation(f.db,f.context,true),/lease|ownership/i);
  assert.equal(await f.db.directorNextEvent.count(),0);
});
test('book ownership and saved contract scope are checked before creating a binding', async t => {
  const f=await fixture(t);
  await f.db.novel.update({where:{id:'novel-1'},data:{directorEpoch:1}});
  await assert.rejects(()=>f.api.chooseProductionBatchImplementation(f.db,f.context,true),/ownership|epoch/i);
  await f.db.novel.update({where:{id:'novel-1'},data:{directorEpoch:0}});
  f.context.contract.chapterRange.to=4;
  await assert.rejects(()=>f.api.chooseProductionBatchImplementation(f.db,f.context,true),/contract|scope/i);
  assert.equal(await f.db.directorNextEvent.count(),0);
});
