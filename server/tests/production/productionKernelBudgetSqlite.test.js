const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('./batch/fixture.cjs');
async function fixture(t) {
 const api=require('../../dist/app/director/productionKernel');
 assert.equal(typeof api.createKernelChapterBudget,'function','durable kernel chapter budget must be exported');
 const f=await base(t);f.contract.launchInput={chapterTokenLimit:100};
 await f.db.directorNextRun.update({where:{id:f.contract.runId},data:{contractJson:JSON.stringify(f.contract)}});
 const unit={novelId:'novel-1',chapterId:'chapter-1',order:1};
 return {...f,unit,budget:api.createKernelChapterBudget(f.db,f.context),usage:(id,tokens)=>({invocationId:id,novelId:'novel-1',chapterId:'chapter-1',
  runId:'batch-1',status:'completed',usage:tokens===null?null:{totalTokens:tokens},startedAt:new Date(0),finishedAt:new Date(1)})};
}
test('durable physical reservations are idempotent and cannot exceed the saved chapter allowance',async t=>{
 const f=await fixture(t);assert.equal(await f.budget.reserve(f.unit,'physical-1',60),true);
 assert.equal(await f.budget.reserve(f.unit,'physical-1',60),true);
 assert.equal(await f.budget.reserve(f.unit,'physical-2',50),false);
 assert.equal((await f.budget.read(f.unit)).used,60);
});
test('actual usage replaces its own reservation and repeated invocation receipts never double charge',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.budget.observe(f.unit,'physical-1',f.usage('invocation-1',20));await f.budget.observe(f.unit,'physical-1',f.usage('invocation-1',20));
 assert.equal((await f.budget.read(f.unit)).used,20);
 assert.equal(await f.budget.reserve(f.unit,'physical-2',80),true);
 assert.equal((await f.budget.read(f.unit)).used,100);
});
test('unknown usage retains its reservation instead of publishing zero consumption',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.budget.observe(f.unit,'physical-1',f.usage('invocation-1',null));
 assert.equal((await f.budget.read(f.unit)).used,60);assert.equal(await f.budget.reserve(f.unit,'physical-2',50),false);
});
test('already incurred usage remains recordable after lease replacement but cannot authorize another request',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.db.directorNextRunControl.update({where:{runId:'batch-1'},data:{leaseOwner:'worker:2',status:'cancelled'}});
 const before=await f.db.directorNextRunControl.findFirst();
 await f.budget.observe(f.unit,'physical-1',f.usage('invocation-1',25));
 assert.equal((await f.budget.read(f.unit)).used,25);
 await assert.rejects(()=>f.budget.reserve(f.unit,'physical-2',10),/lease|ownership/i);
 assert.deepEqual(await f.db.directorNextRunControl.findFirst(),before);
});
test('budget requests cannot borrow a different chapter scope or change a reserved amount',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.budget.reserve({...f.unit,order:4},'physical-1',60),/scope|identity/i);
 await f.budget.reserve(f.unit,'physical-1',60);await assert.rejects(()=>f.budget.reserve(f.unit,'physical-1',70),/identity|reservation/i);
 assert.equal((await f.budget.read(f.unit)).used,60);
});
test('a proven unsent reservation is reusable but a dispatched invocation can never be released',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.budget.releaseUndispatched(f.unit,'physical-1');assert.equal((await f.budget.read(f.unit)).used,0);
 assert.equal(await f.budget.reserve(f.unit,'physical-1',60),true);assert.equal((await f.budget.read(f.unit)).used,60);
 await f.budget.observe(f.unit,'physical-1',f.usage('invocation-1',20));
 await assert.rejects(()=>f.budget.releaseUndispatched(f.unit,'physical-1'),/dispatched/i);
 assert.equal((await f.budget.read(f.unit)).used,20);
});
test('late observed usage remains charged even when its reservation was previously released',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.budget.releaseUndispatched(f.unit,'physical-1');
 await f.budget.observe(f.unit,'physical-1',f.usage('late-invocation',25));
 assert.equal((await f.budget.read(f.unit)).used,25);
 await assert.rejects(()=>f.budget.releaseUndispatched(f.unit,'physical-1'),/dispatched/i);
});
test('known provider cache hits retain the native uncached-token budget metric across recreation',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-cache',90);
 const record=f.usage('cached-invocation',80);record.usage={promptTokens:60,completionTokens:20,totalTokens:80,
  inputCache:{cacheHitTokens:40,cacheMissTokens:20,cacheWriteTokens:0,cacheUsageStatus:'reported'}};
 await f.budget.observe(f.unit,'physical-cache',record);
 const view=await f.api.createKernelChapterBudget(f.db,f.context).read(f.unit);
 assert.equal(view.metric,'uncached_tokens_v1');assert.equal(view.used,40);assert.equal(view.rawTokens,80);
 assert.equal(view.promptTokens,60);assert.equal(view.completionTokens,20);assert.equal(view.cacheHitTokens,40);
 assert.equal(await f.budget.reserve(f.unit,'next-request',60),true);
});
test('total-only reports retain unclassified consumption and unreported cache never creates free allowance',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-total',90);
 const record=f.usage('total-invocation',80);record.usage={promptTokens:20,completionTokens:10,totalTokens:80,
  inputCache:{cacheHitTokens:null,cacheMissTokens:null,cacheWriteTokens:null,cacheUsageStatus:'unavailable'}};
 await f.budget.observe(f.unit,'physical-total',record);const view=await f.budget.read(f.unit);
 assert.equal(view.used,80);assert.equal(view.unclassifiedTokens,50);assert.equal(view.cacheHitTokens,0);
});
test('known paid usage remains charged alongside an unknown invocation under the same reservation',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-unknown',60);
 await f.budget.observe(f.unit,'physical-unknown',f.usage('unknown-invocation',null));
 await f.budget.observe(f.unit,'physical-unknown',f.usage('late-paid-invocation',25));
 const view=await f.budget.read(f.unit);assert.equal(view.used,85);assert.equal(view.rawTokens,25);
 assert.equal(view.hasUnknownUsage,true);assert.equal(await f.budget.reserve(f.unit,'next-request',16),false);
});
test('historical raw-only receipts remain immutable when richer cache telemetry is replayed',async t=>{
 const f=await fixture(t);await f.budget.reserve(f.unit,'physical-1',60);
 await f.budget.observe(f.unit,'physical-1',f.usage('historical',80));
 const row=await f.db.chapterArtifactSyncCheckpoint.findFirstOrThrow({where:{artifactType:'production_kernel_usage:v1'}});
 const original=JSON.parse(row.metadataJson);delete original.accounting;
 await f.db.chapterArtifactSyncCheckpoint.update({where:{id:row.id},data:{metadataJson:JSON.stringify(original)}});
 const usage=f.usage('historical',80);usage.usage={totalTokens:80,promptTokens:60,completionTokens:20,
  inputCache:{cacheUsageStatus:'reported',cacheHitTokens:40}};
 await f.budget.observe(f.unit,'physical-1',usage);
 assert.equal((await f.budget.read(f.unit)).used,80);
 assert.equal((await f.db.chapterArtifactSyncCheckpoint.findUnique({where:{id:row.id}})).metadataJson,JSON.stringify(original));
});
test('mutating the caller context cannot enlarge an already captured chapter budget',async t=>{
 const f=await fixture(t);
 f.context.contract.launchInput.chapterTokenLimit=1000;
 assert.equal((await f.budget.read(f.unit)).limit,100);
 assert.equal(await f.budget.reserve(f.unit,'oversized',101),false);
});
test('stage preflight does not double charge physical usage and saves an explicit unsent denial',async t=>{
 const f=await fixture(t);assert.equal(typeof f.budget.preflight,'function');
 assert.equal(await f.budget.preflight(f.unit,'stage-output',60),true);
 assert.equal((await f.budget.read(f.unit)).used,0);
 await f.budget.reserve(f.unit,'physical-1',80);
 assert.equal(await f.budget.preflight(f.unit,'stage-output',30),false);
 assert.equal((await f.budget.read(f.unit)).used,80);
 const blocked=await f.db.chapterArtifactSyncCheckpoint.findFirst({where:{artifactType:'production_kernel_budget_block:v1',status:'blocked'}});
 assert.equal(JSON.parse(blocked.metadataJson).tokens,30);
});
