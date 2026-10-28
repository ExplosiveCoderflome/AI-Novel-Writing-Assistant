const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./batch/fixture.cjs');
const {createRequire}=require('node:module'),path=require('node:path');
const fromServer=createRequire(path.resolve(__dirname,'../../package.json'));
async function setup(t){
 const f=await fixture(t);
 const presets=fromServer('@ai-novel/shared/types/directorIssue').DIRECTOR_ISSUE_POLICY_PRESETS;
 f.contract.issuePolicy.pipelinePolicy=structuredClone(presets.find(row=>row.id==='finish_full_book').policy);
 f.contract.launchInput={storyInput:'故事',estimatedChapterCount:3,chapterTokenLimit:100000,worldMode:'skip',targetMode:'opening'};
 await f.db.directorNextRun.update({where:{id:f.contract.runId},data:{contractJson:JSON.stringify(f.contract)}});
 const fallback={enabled:false,provider:'test',model:'test',temperature:0.2,maxTokens:4096,retryCount:0};
 const sources={readFallback:async()=>fallback,readWindows:()=>[{provider:'test',model:'test',contextWindow:200000}],
  resolveModel:async(provider,options)=>({provider,model:options.model,baseURL:'https://invalid.test',temperature:options.temperature??0.3,
   maxTokens:options.maxTokens??8192,taskType:options.taskType,executionMode:options.executionMode,requestProtocol:'openai_compatible'})};
 return{...f,sources};
}
test('native runtime captures the contract and installs all production stages with durable physical accounting',async t=>{
 const f=await setup(t);assert.equal(typeof f.api.createNativeKernelRuntime,'function');
 const runtime=await f.api.createNativeKernelRuntime(f.db,f.context,{modelSources:f.sources});
 const unit={novelId:'novel-1',chapterId:'chapter-1',order:1},request=runtime.request(unit),ports=runtime.ports(unit);
 assert.equal(request.ownerKey,f.api.productionBatchOwnerKey(f.contract.runId));
 assert.equal(request.model.provider,'test');assert.equal(request.model.model,'test');
 assert.deepEqual(request.profile.outputBudgets,{draft:8192,accept:8192,repair:8192,verify:8192});
 assert.deepEqual(request.policySource,f.contract.issuePolicy.pipelinePolicy);
 assert.deepEqual(Object.keys(ports.stages).sort(),['prepare','draft','accept','repair','verify','commit','reconcile'].sort());
 const run=await ports.store.loadOrCreate(request);await ports.fence(run,'loaded');
 assert.equal((await ports.budget.reserve({runId:run.id,stage:'draft',requestKey:'preflight',outputTokens:6000})).accepted,true);
 assert.equal((await f.api.createKernelChapterBudget(f.db,f.context).read(unit)).used,0);
 await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{leaseOwner:'replacement'}});
 await assert.rejects(ports.fence(run,'before_execute'),/lease|ownership/);
});

test('native request fences reject a changed durable unit claim before another physical dispatch',async t=>{
 const f=await setup(t),runtime=await f.api.createNativeKernelRuntime(f.db,f.context,{modelSources:f.sources});
 const unit={novelId:'novel-1',chapterId:'chapter-1',order:1},ports=runtime.ports(unit),run=await ports.store.loadOrCreate(runtime.request(unit));
 await f.db.productionUnitRun.update({where:{id:run.id},data:{version:{increment:1},activeStage:'draft',activeRequestKey:'replacement'}});
 await assert.rejects(ports.fence(run,'before_execute'));
 assert.equal((await f.api.createKernelChapterBudget(f.db,f.context).read(unit)).used,0);
});

test('native composition retains the captured contract and worker when its caller object changes',async t=>{
 const f=await setup(t),native=require('../../dist/app/director/productionKernel/composition/stages');
 const original=native.createNativeKernelStages;let seen;
 native.createNativeKernelStages=deps=>{seen=deps.context;return original(deps);};t.after(()=>{native.createNativeKernelStages=original;});
 const before=structuredClone(f.context),runtime=await f.api.createNativeKernelRuntime(f.db,f.context,{modelSources:f.sources});
 f.context.contract.launchInput.temperature=1.9;f.context.control.version=99;f.context.execution.leaseOwner='replacement';
 runtime.ports({novelId:'novel-1',chapterId:'chapter-1',order:1});
 assert.deepEqual(seen.contract,before.contract);assert.deepEqual(seen.control,before.control);assert.deepEqual(seen.execution,before.execution);
});
test('resume retains a previously saved output profile instead of adopting new defaults',async t=>{
 const f=await setup(t),unit={novelId:'novel-1',chapterId:'chapter-1',order:1};
 const first=await f.api.createNativeKernelRuntime(f.db,f.context,{modelSources:f.sources});
 const saved=first.request(unit);
 saved.profile.outputBudgets={draft:6000,accept:4096,repair:4200,verify:6144};
 const before=await first.ports(unit).store.loadOrCreate(saved);
 const resumed=await f.api.createNativeKernelRuntime(f.db,f.context,{modelSources:f.sources});
 assert.deepEqual(resumed.request(unit).profile.outputBudgets,saved.profile.outputBudgets);
 const after=await resumed.ports(unit).store.loadOrCreate(resumed.request(unit));
 assert.equal(after.id,before.id);assert.deepEqual(after.snapshots,before.snapshots);
});
