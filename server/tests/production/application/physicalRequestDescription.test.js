const test=require('node:test'),assert=require('node:assert/strict');
const budget=require('../../../dist/platform/llm/retries');
test('physical request metadata remains available through nested review-budget callbacks and is cleared afterwards',async()=>{
 assert.equal(typeof budget.currentModelRequestDescription,'function','physical budget reservation requires the actual request');
 const request={input:[{role:'user',content:'完整原文'}],options:{response_format:{type:'json_object'}},configuration:{provider:'openai',model:'fixture',maxTokens:4200}};
 let captured;
 const outer={remaining:()=>2,beforeRequest:async()=>{captured=budget.currentModelRequestDescription()}};
 const nested={remaining:()=>2,beforeRequest:()=>outer.beforeRequest()};
 await budget.withModelRequestBudget(outer,()=>budget.withModelRequestBudget(nested,()=>budget.claimModelRequest(request)));
 assert.deepEqual(captured,request);assert.equal(budget.currentModelRequestDescription(),undefined);
});
test('the native text runner exposes complete effective messages before the physical reservation',async()=>{
 assert.equal(typeof budget.currentModelRequestDescription,'function');
 const runner=require('../../../dist/prompting/core/promptRunner'),{chapterWriterPrompt}=require('../../../dist/prompting/prompts/novel/chapterWriter.prompts');
 const template=require('../../../dist/prompting/templates/PromptTemplateOverrideService').promptTemplateOverrideService;
 const slots=require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
 const oldTemplate=template.getActiveCustomTemplate,oldSlots=slots.resolveForRuntime;
 let captured;runner.setPromptRunnerLLMFactoryForTests(async()=>({stream:async function*(){yield{content:'测试结果'}}}));
 template.getActiveCustomTemplate=async()=>null;slots.resolveForRuntime=async()=>({appendBlocks:[]});
 try{
  const groups=require('../../../dist/prompting/templates/templateTypes').getRequiredTemplateContextGroups(chapterWriterPrompt.id);
  const contextBlocks=groups.map(group=>({id:group,group,priority:100,required:true,estimatedTokens:10,content:'完整描述保留到物理预约'}));
  await budget.withModelRequestBudget({remaining:()=>1,beforeRequest:async()=>{captured=budget.currentModelRequestDescription()}},()=>runner.runTextPrompt({asset:chapterWriterPrompt,promptInput:{novelTitle:'书',chapterTitle:'章',chapterOrder:1,mode:'draft'},contextBlocks}));
  assert.ok(captured);assert.ok(JSON.stringify(captured.input).includes('完整描述保留到物理预约'));
 }finally{runner.setPromptRunnerLLMFactoryForTests();template.getActiveCustomTemplate=oldTemplate;slots.resolveForRuntime=oldSlots;}
});
test('native structured invocation and JSON correction expose each complete request under the frozen preflight policy',async t=>{
 const api=require('../../../dist/app/director/productionKernel'),kernel=require('../../../dist/modules/production');
 const runner=require('../../../dist/prompting/core/promptRunner'),factory=require('../../../dist/llm/factory');
 const route=require('../../../dist/llm/modelRouter'),policy=require('../../../dist/platform/llm/execution');
 const slots=require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
 const saved={resolve:route.resolveModel,create:factory.createLLMFromResolvedOptions,get:factory.getLLM,metadata:factory.getResolvedLLMClientOptionsFromInstance,slots:slots.resolveForRuntime};
 const seen=[],clients=new WeakMap();let dispatched=0;
 route.resolveModel=async(_task,options)=>({provider:options.provider??'openai',model:options.model??'fixture-model',temperature:options.temperature??0.2,maxTokens:options.maxTokens,requestProtocol:'openai_compatible',structuredResponseFormat:'auto',routeKey:'fixture',routeDegraded:false});
 factory.setProviderSecretCache('openai',{key:'fixture-key',baseURL:'https://models.invalid/v1',reasoningEnabled:false});
 slots.resolveForRuntime=async()=>({appendBlocks:[]});
 const make=configuration=>{
  policy.assertLlmExecutionConfiguration(configuration);
  const client=policy.attachLlmExecutionPolicy({invoke:async()=>{throw new Error('Expected streaming transport')},batch:async()=>{throw new Error('Expected one request')},stream:async function*(){dispatched++;yield{content:dispatched===1?'{"bad":true}':JSON.stringify({strategy:'patch_first',summary:'完成',patches:[],requiresFullRewrite:false,escalationReason:null})};}},configuration);
  clients.set(client,configuration);return client;
 };
 factory.createLLMFromResolvedOptions=make;
 factory.getLLM=async(provider,options)=>make(await factory.resolveLLMClientOptions(provider,options));
 factory.getResolvedLLMClientOptionsFromInstance=client=>clients.get(client);
 t.after(()=>{route.resolveModel=saved.resolve;factory.createLLMFromResolvedOptions=saved.create;factory.getLLM=saved.get;factory.getResolvedLLMClientOptionsFromInstance=saved.metadata;slots.resolveForRuntime=saved.slots;factory.setProviderSecretCache('openai',null)});
 const request=kernel.buildKernelPatchPromptRequest(require('../prompts/nativeFixture.cjs').patchInput());
 request.options.provider='openai';request.options.model='fixture-model';
 const prepared=await api.createKernelPromptPreparer({contextWindowFor:async()=>1000000,readFallback:async()=>({enabled:false,provider:'openai',model:'',temperature:0.2,maxTokens:3000,retryCount:0})}).prepare(request);
 const result=await prepared.execute(()=>budget.withModelRequestBudget({remaining:()=>3-seen.length,beforeRequest:async()=>{
  const description=budget.currentModelRequestDescription();seen.push({description,reserved:prepared.reserveTokens(description)});
 }},()=>runner.runStructuredPrompt(request)));
 assert.equal(result.output.summary,'完成');assert.equal(dispatched,2);assert.equal(seen.length,2);
 assert.ok(JSON.stringify(seen[0].description.input).includes(request.promptInput.chapterContent));
 assert.ok(JSON.stringify(seen[1].description.input).includes(request.promptInput.chapterContent));
 assert.ok(JSON.stringify(seen[1].description.input).includes('bad'));
 assert.equal(seen[1].description.configuration.temperature,0.15);assert.ok(seen[1].reserved>seen[0].reserved);
});
