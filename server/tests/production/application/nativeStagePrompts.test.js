const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/app/director/productionKernel'),k=require('../../../dist/modules/production');
const {input,patchInput}=require('../prompts/nativeFixture.cjs'),{request}=require('./harness.cjs'),{assessmentResult}=require('./assessmentFixture.cjs');
const slots=require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
function fixture(t){
 assert.equal(typeof api.createKernelNativeStagePrompts,'function','native stage descriptors must install the real preflight policy');
 const saved=slots.resolveForRuntime,state={append:'原始覆盖',builds:0,fences:0,reservations:0};
 slots.resolveForRuntime=async()=>({appendBlocks:[{id:'custom_slot:stage',group:'custom_slot',priority:999,required:true,estimatedTokens:2,content:state.append}]});t.after(()=>slots.resolveForRuntime=saved);
 const req=request({model:{provider:'openai',model:'fixture-model',promptVersion:'native',configVersion:'frozen-config',inputFingerprint:'input'}});
 const run={id:'unit-1',ownerKey:req.ownerKey,version:1,snapshots:{profile:req.profile,policy:req.policy,policySource:req.policySource,model:req.model},progress:{unit:req.unit,completed:[],repairAttemptsUsed:0},artifacts:{receipts:{}},activeStage:'accept',activeRequestKey:'request-1'};
 const prepared={novelTitle:'测试书',chapterTitle:'城门',baseline:{content:'',updatedAt:'2026-10-23T00:00:00.000Z',protectedUserContent:false},contextPackage:input(true).contextPackage};
 const runtime=patchInput(true).runtimePackage;
 const preflight=api.createKernelPromptPreparer({contextWindowFor:async()=>1000000,readFallback:async()=>({enabled:false,provider:'openai',model:'',temperature:0.2,maxTokens:3000,retryCount:0}),
  resolveModel:async(provider,options)=>({provider,model:options.model,providerName:'fixture',temperature:options.temperature??0.3,maxTokens:options.maxTokens,baseURL:'https://models.invalid/v1',authMode:'bearer',requestProtocol:'openai_compatible',executionMode:options.executionMode??'plain',structuredStrategy:options.structuredStrategy??null,reasoningEnabled:false,reasoningEffort:null,reasoningForcedOff:false,includeRawResponse:false,concurrencyLimit:0,requestIntervalMs:0,taskType:options.taskType,timeoutMs:options.timeoutMs})});
 const stages=api.createKernelNativeStagePrompts({preflight,resolveAcceptanceContext:async x=>({blocks:x.fallbackBlocks}),resolveWriterContext:async()=>[],
  buildRepairRuntime:async()=>{state.builds++;return runtime},invokeWriter:async()=>({output:'测试正文'}),requestLimit:()=>3,
  fence:async()=>{state.fences++},budget:{reserve:async()=>{state.reservations++;return true},observe:async()=>{},releaseUndispatched:async()=>{}}});
 return{state,run,prepared,runtime,stages};
}
test('initial and candidate review descriptors retain complete native input, baselines and different output caps',async t=>{
 const f=fixture(t),content='首段。'+'完整正文。'.repeat(1000)+'尾段。',baseline=assessmentResult();
 const first=await f.stages.describe('accept',f.run,{prepared:f.prepared,content});
 const candidate=await f.stages.describe('verify',f.run,{prepared:f.prepared,content,baseline,repair:{styleRewriteBaseline:{sourceContentHash:'original',allowedCorrectionIssueIds:[],changes:[]}}});
 assert.equal(first.outputTokens,4096);assert.equal(candidate.outputTokens,6144);assert.notEqual(first.inputFingerprint,candidate.inputFingerprint);
 assert.equal(candidate.input.nativePrompt.promptInput.content,content);assert.deepEqual(candidate.input.nativePrompt.promptInput.repairReviewBaseline,baseline.assessment);
 assert.ok(candidate.input.nativePrompt.promptInput.styleRewriteBaseline);assert.equal(f.state.reservations,0);
});
test('repair describes once and executes with the exact saved native runtime and patch permissions',async t=>{
 const f=fixture(t);f.run.activeStage='repair';const assessment=assessmentResult(),content='阿青交出钥匙。';
 const call=await f.stages.describe('repair',f.run,{prepared:f.prepared,content,assessment});
 assert.equal(call.outputTokens,4200);assert.equal(f.state.builds,1);
 const restored=await f.stages.repairRuntime({run:f.run,prepared:f.prepared,content,assessment,call});
 assert.deepEqual(restored,f.runtime);assert.equal(f.state.builds,1);
 const protection=JSON.parse(call.input.nativePrompt.promptInput.styleProtection);
 assert.ok(protection.allowedIssueIds.includes('plot-gap'));assert.equal(protection.allowedIssueIds.includes('report-only'),false);
 restored.audit.openIssues.length=0;assert.equal((await f.stages.repairRuntime({run:f.run,prepared:f.prepared,content,assessment,call})).audit.openIssues.length,2);
});
test('effective overlay drift rejects before native execution and cannot publish a cached result',async t=>{
 const f=fixture(t);f.run.activeStage='repair';
 const call=await f.stages.describe('repair',f.run,{prepared:f.prepared,content:'完整正文',assessment:assessmentResult()});let executed=0;
 f.state.append='发布后覆盖';
 await assert.rejects(()=>f.stages.scoped(f.run,{...call,requestKey:'request-1'},async()=>{executed++}),/snapshot|快照/i);assert.equal(executed,0);
 f.state.append='原始覆盖';
 await assert.rejects(()=>f.stages.scoped(f.run,{...call,requestKey:'request-1'},async()=>{executed++;f.state.append='调用中覆盖';return'cached result'}),/snapshot|快照/i);
 assert.equal(executed,1);assert.equal(f.state.reservations,0);
});
test('non-model preparation descriptors fence execution without inventing physical reservations',async t=>{
 const f=fixture(t);f.run.activeStage='prepare';const call=await f.stages.describe('prepare',f.run,{unit:f.run.progress.unit});
 assert.equal(call.callsModel,false);assert.equal(await f.stages.scoped(f.run,{...call,requestKey:'request-1'},async()=>'ready'),'ready');
 assert.equal(f.state.reservations,0);assert.ok(f.state.fences>=2);
});
