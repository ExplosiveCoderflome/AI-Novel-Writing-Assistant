const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('./batch/fixture.cjs');
const {request}=require('./application/harness.cjs');
const {claimModelRequest}=require('../../dist/platform/llm/retries');
const {captureInvocationUsageObserver}=require('../../dist/platform/llm/usage');
const native=require('../../dist/services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget');
async function fixture(t) {
 const f=await base(t),api=f.api;
 assert.equal(typeof api.createKernelReviewBudget,'function','native review retries require a durable kernel adapter');
 f.contract.launchInput={chapterTokenLimit:1000};await f.db.directorNextRun.update({where:{id:'batch-1'},data:{contractJson:JSON.stringify(f.contract)}});
 const req=request({ownerKey:api.productionBatchOwnerKey('batch-1'),policySource:{maxAutomaticRetries:1,issueActions:{},chapterReviewRetryPolicy:{maxRetries:1,onExhausted:'continue_with_warning'}}});
 const store=new f.kernel.PrismaUnitProgressStore(f.db,{assertOwnership:api.createKernelOwnership(f.context)});
 let run=await store.loadOrCreate(req);run=await store.compareAndSwap(run,{...run,activeStage:'accept',activeRequestKey:'initial-check'});
 const budget=api.createKernelChapterBudget(f.db,f.context),review=api.createKernelReviewBudget(f.db,f.context);
 let invocation=0;
 async function physical() {await claimModelRequest();await captureInvocationUsageObserver()({invocationId:`inv-${++invocation}`,runId:'batch-1',novelId:'novel-1',chapterId:'chapter-1',status:'completed',usage:{totalTokens:10},startedAt:new Date(0),finishedAt:new Date(1)});}
 const scoped=(value,operation)=>api.runKernelRequestScope({unit:value.progress.unit,requestKey:value.activeRequestKey,maxRequests:10,reserveTokens:100,budget,fence:()=>api.assertKernelOwnership(f.db,f.context)},()=>review(value,operation));
 return {...f,req,store,run,budget,review,physical,scoped};
}
test('initial and candidate checks share one durable retry allowance across adapter recreation',async t=>{
 const f=await fixture(t);
 await f.scoped(f.run,async()=>{const b=native.currentChapterReviewRetryBudget();await b.runCheck('initial',f.physical);await b.runCheck('initial',f.physical);});
 const candidate=await f.store.compareAndSwap(f.run,{...f.run,activeStage:'verify',activeRequestKey:'candidate-check'});
 await f.scoped(candidate,async()=>{const b=native.currentChapterReviewRetryBudget();await b.runCheck('candidate',f.physical);
  await assert.rejects(()=>b.runCheck('candidate',f.physical),native.ReviewRetryExhaustedError);assert.equal(b.summary().used,1);});
 assert.equal((await f.budget.read(f.run.progress.unit)).used,30);
});
test('an exhausted native retry releases its own physical reservation before the provider can run',async t=>{
 const f=await fixture(t);let calls=0;
 await f.scoped(f.run,async()=>{const b=native.currentChapterReviewRetryBudget();for(let i=0;i<2;i++)await b.runCheck('initial',f.physical);
  await assert.rejects(()=>b.runCheck('initial',async()=>{await f.physical();calls++;}),native.ReviewRetryExhaustedError);});
 assert.equal(calls,0);assert.equal((await f.budget.read(f.run.progress.unit)).used,20);
});
test('a changed saved policy cannot reset the persisted retry count',async t=>{
 const f=await fixture(t);await f.scoped(f.run,()=>native.currentChapterReviewRetryBudget().runCheck('initial',f.physical));
 const changed=structuredClone(f.run);changed.snapshots.policySource.chapterReviewRetryPolicy.maxRetries=2;
 await assert.rejects(()=>f.scoped(changed,async()=>{}),/policy|snapshot/i);
});
test('a replaced lease prevents retry receipts and provider dispatch',async t=>{
 const f=await fixture(t);await f.db.directorNextRunControl.update({where:{runId:'batch-1'},data:{leaseOwner:'worker:2'}});
 await assert.rejects(()=>f.scoped(f.run,()=>native.currentChapterReviewRetryBudget().runCheck('initial',f.physical)),/lease|ownership/i);
 assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({where:{sourceStage:'review_retry'}}),0);
});
test('a stale unit request cannot append retry state after its claim changes',async t=>{
 const f=await fixture(t);await f.store.compareAndSwap(f.run,{...f.run,activeStage:'verify',activeRequestKey:'next-check'});
 await assert.rejects(()=>f.scoped(f.run,()=>native.currentChapterReviewRetryBudget().runCheck('initial',f.physical)),/claim|request/i);
 assert.equal((await f.budget.read(f.run.progress.unit)).used,0);
});
test('a swallowed native retry-store failure still prevents publishing a fallback assessment',async t=>{
 const f=await fixture(t),transact=f.db.$transaction.bind(f.db);
 f.db.$transaction=operation=>transact(tx=>operation(new Proxy(tx,{get(target,key){
  if(key==='chapterArtifactSyncCheckpoint')return new Proxy(target[key],{get(delegate,method){
   if(method==='create')return async()=>{throw new Error('retry persistence unavailable')};
   return delegate[method];
  }});return target[key];
 }})));
 const {withModelRequestBudget}=require('../../dist/platform/llm/retries');
 await assert.rejects(()=>withModelRequestBudget({remaining:()=>10,beforeRequest:async()=>{}},()=>f.review(f.run,async()=>{
  try{await native.currentChapterReviewRetryBudget().runCheck('initial',claimModelRequest)}catch{}
  return {fallback:true};
 })),/persistence unavailable/);
});
