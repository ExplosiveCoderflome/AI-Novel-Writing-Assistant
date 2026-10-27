const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/app/director/productionKernel');
const common=require('../../../dist/modules/production/common');
const {request}=require('./harness.cjs');
test('preparation uses actual native prompts, physical reservations and saved native result metadata on replay',async t=>{
 const runner=require('../../../dist/prompting/core/promptRunner'),factory=require('../../../dist/llm/factory');
 const route=require('../../../dist/llm/modelRouter'),policy=require('../../../dist/platform/llm/execution');
 const slots=require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
 const saved={resolve:route.resolveModel,create:factory.createLLMFromResolvedOptions,get:factory.getLLM,
   metadata:factory.getResolvedLLMClientOptionsFromInstance,slots:slots.resolveForRuntime};
 const clients=new WeakMap(),state={models:0,reserved:[],observed:[],descriptions:[],fences:0};
 const usage=require('../../../dist/llm/usageTracking');
 const repository=require('../../../dist/platform/llm/usage').PrismaInvocationUsageRepository;
 const originalRecord=repository.prototype.record;repository.prototype.record=async()=>{};
 route.resolveModel=async(_task,options)=>({provider:options.provider??'openai',model:options.model??'fixture-model',
   temperature:options.temperature??0.2,maxTokens:options.maxTokens,requestProtocol:'openai_compatible',
   structuredResponseFormat:'auto',routeKey:'fixture',routeDegraded:false});
 factory.setProviderSecretCache('openai',{key:'fixture-key',baseURL:'https://models.invalid/v1',reasoningEnabled:false});
 slots.resolveForRuntime=async()=>({appendBlocks:[]});
 const assessment=require('../planning/contractFixture.cjs').safe;
 const make=configuration=>{
   policy.assertLlmExecutionConfiguration(configuration);
   const tracked=usage.attachLLMUsageTracking({invoke:async()=>{throw Error('Expected streaming transport');},
     batch:async()=>{throw Error('Expected one model call');},stream:async function*(){state.models++;yield{content:JSON.stringify(assessment)};}},configuration);
   const client=policy.attachLlmExecutionPolicy(tracked,configuration);
   clients.set(client,configuration);return client;
 };
 factory.createLLMFromResolvedOptions=make;
 factory.getLLM=async(provider,options)=>make(await factory.resolveLLMClientOptions(provider,options));
 factory.getResolvedLLMClientOptionsFromInstance=client=>clients.get(client);
 t.after(()=>{route.resolveModel=saved.resolve;factory.createLLMFromResolvedOptions=saved.create;factory.getLLM=saved.get;
   factory.getResolvedLLMClientOptionsFromInstance=saved.metadata;slots.resolveForRuntime=saved.slots;factory.setProviderSecretCache('openai',null);repository.prototype.record=originalRecord;});
 const req=request({model:{provider:'openai',model:'fixture-model',promptVersion:'native',configVersion:'saved',inputFingerprint:'input'}});
 const run={id:'unit-1',ownerKey:req.ownerKey,version:1,snapshots:{profile:req.profile,policy:req.policy,model:req.model},
   progress:{unit:req.unit,completed:[],repairAttemptsUsed:0},artifacts:{receipts:{}},activeStage:'prepare',activeRequestKey:'prepare-request'};
 const preflight=api.createKernelPromptPreparer({contextWindowFor:async()=>1000000,
   readFallback:async()=>({enabled:false,provider:'openai',model:'',temperature:0.2,maxTokens:3000,retryCount:0})});
 const cache=new Map(),steps={model:async(key,description,invoke)=>{
   state.descriptions.push(description);const existing=cache.get(key);
   if(existing){assert.equal(common.canonicalProductionJson(description),common.canonicalProductionJson(existing.description));return existing.value;}
   const value=await invoke(description,'physical-request-1');cache.set(key,{description,value});return value;
 }};
 const deps={preflight,requestLimit:()=>4,fence:async()=>{state.fences++;},budget:{
   reserve:async(unit,key,tokens)=>{state.reserved.push({unit,key,tokens});return true;},
   observe:async(unit,key,record)=>state.observed.push({unit,key,chapterId:record.chapterId}),
   releaseUndispatched:async()=>{throw Error('No budget rejection expected');}},invokePrompt:runner.runStructuredPrompt};
 const native=require('../../../dist/services/novel/volume/ChapterTaskSheetQualityGateService').buildChapterTaskSheetQualityPromptRequest;
 const candidate=require('../planning/contractFixture.cjs').candidate({chapterId:'volume-plan-chapter-1',
   previousChapterResult:{chapterOrder:1,title:'前章',summary:'纸条来自钟内',tail:'结束',content:'完整前文。'.repeat(800)}});
 const input=native({candidate,mode:'full_book_autopilot',options:{provider:'openai',model:'fixture-model'}});input.options.maxTokens=4096;
 const result=await api.createKernelPreparationPromptInvoker(deps,run,steps)(input);
 assert.deepEqual(result.output,assessment);assert.ok(result.meta.invocation);assert.ok(result.context);
 assert.equal(state.models,1);assert.equal(state.reserved.length,1);assert.equal(state.observed.length,1);
 assert.equal(state.observed[0].chapterId,'chapter-1');assert.ok(state.reserved[0].tokens>4096);
 assert.equal(state.descriptions[0].input.promptInput.candidate.previousChapterResult.content,candidate.previousChapterResult.content);
 assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps,run,steps)(input),result);
 assert.equal(state.models,1);assert.equal(state.reserved.length,1);
 // A resumed evaluation whose attempt carries new round feedback must not alias
 // the saved no-feedback attempt: same asset and ordinal, different guidance.
 const guided={...input,promptInput:{...input.promptInput,guidance:'上一章实际正文与本章规划需要协调'}};
 const guidedResult=await api.createKernelPreparationPromptInvoker(deps,run,steps)(guided);
 assert.deepEqual(guidedResult.output,result.output);
 assert.equal(state.models,2);assert.equal(state.reserved.length,2);
 assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps,run,steps)(input),result);
 assert.equal(state.models,2);assert.equal(state.reserved.length,2);
 // A resumed evaluation whose previous-chapter context block was rebuilt in a
 // different shape must not alias the saved attempt either: same asset,
 // ordinal and guidance, only the previous_chapter_result block differs.
 const prevBlock=(content)=>({id:'previous_chapter_result',group:'previous_chapter_result',priority:100,required:true,content});
 const blocked={...input,contextBlocks:[prevBlock('上一章已保存的实际结果：\n{"chapterOrder":1,"title":"前章","summary":"纸条来自钟内","tail":"结束","content":"完整前文。"}')]};
 const blockedResult=await api.createKernelPreparationPromptInvoker(deps,run,steps)(blocked);
 assert.deepEqual(blockedResult.output,result.output);
 assert.equal(state.models,3);assert.equal(state.reserved.length,3);
 const reblocked={...input,contextBlocks:[prevBlock('上一章已保存的实际结果：\n{"chapterOrder":1,"content":"完整前文。"}')]};
 const reblockedResult=await api.createKernelPreparationPromptInvoker(deps,run,steps)(reblocked);
 assert.deepEqual(reblockedResult.output,result.output);
 assert.equal(state.models,4);assert.equal(state.reserved.length,4);
 assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps,run,steps)(blocked),blockedResult);
 assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps,run,steps)(input),result);
 assert.equal(state.models,4);assert.equal(state.reserved.length,4);
});
