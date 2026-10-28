const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./batch/assembledFixture.cjs');
const {request}=require('./application/harness.cjs');
// These fixtures replace native model preparation. Readiness configuration is exercised separately.
test.mock.method(require('../../dist/app/director/productionKernel/readiness/models'),'inspectKernelModels',async()=>({ready:true}));
async function entry(t,options={}){
 const f=await fixture(t,options);let legacyCalls=0,runtimeCalls=0,enabled=options.enabled!==false;
 assert.equal(typeof f.api.createKernelProductionStep,'function');
 const step=f.api.createKernelProductionStep({db:f.db,enabled:()=>enabled,legacy:async()=>{legacyCalls++;return{debts:[]};},
  runtime:async()=>{runtimeCalls++;return{
   request:unit=>{const req=request({ownerKey:f.api.productionBatchOwnerKey(f.contract.runId),unit});
    req.profile.reconcile='strict';req.profile.capabilities=['character_state','causal_closure'];return req;},
   ports:()=>({store:f.store,stages:f.stages(),fence:f.fence,budget:{reserve:async input=>({accepted:true,reservationKey:input.requestKey})}}),
  };}});
 return{...f,step,legacyCalls:()=>legacyCalls,runtimeCalls:()=>runtimeCalls,flip:()=>{enabled=!enabled;}};
}
test('the persisted production entry runs three kernel chapters and never starts a legacy job',async t=>{
 const f=await entry(t);const result=await f.step(f.context);
 assert.equal(result.stopSignal,undefined);assert.match(result.artifact.contentRef,/chapter_batch_closed/);
 assert.equal(f.legacyCalls(),0);assert.equal(f.runtimeCalls(),1);
 assert.equal(await f.db.generationJob.count(),0);assert.equal(await f.db.auditReport.count(),3);
 const calls=[...f.calls];f.flip();await f.step(f.context);
 assert.deepEqual(f.calls,calls);assert.equal(f.legacyCalls(),0);
 assert.equal(await f.api.readProductionBatchImplementation(f.db,f.contract),'kernel');
});
test('a new default-off batch stays on the legacy path after the flag is enabled',async t=>{
 const f=await entry(t,{enabled:false});await f.step(f.context);f.flip();await f.step(f.context);
 assert.equal(f.legacyCalls(),2);assert.equal(f.runtimeCalls(),0);assert.deepEqual(f.calls,[]);
 assert.equal(await f.api.readProductionBatchImplementation(f.db,f.contract),'legacy');
});
test('a kernel entry preserves completed chapters when the third manuscript is edited',async t=>{
 const f=await entry(t,{editThird:true});await assert.rejects(()=>f.step(f.context),/manuscript changed/);
 assert.equal(await f.db.auditReport.count(),2);assert.equal(f.legacyCalls(),0);
 assert.equal((await f.db.chapter.findUnique({where:{id:'chapter-3'}})).content,'人工保留的第三章');
});
