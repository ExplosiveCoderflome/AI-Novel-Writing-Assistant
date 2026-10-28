const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/app/director/productionKernel');
const k=require('../../../dist/modules/production');
const {patchInput}=require('../prompts/nativeFixture.cjs');
const slots=require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
const base={provider:'openai',providerName:'fixture',model:'fixture-model',temperature:0.35,maxTokens:4200,baseURL:'https://models.invalid/v1',authMode:'bearer',apiKey:'very-sensitive-api-key',
 concurrencyLimit:0,requestIntervalMs:0,reasoningEnabled:false,reasoningEffort:null,includeRawResponse:false,requestProtocol:'openai_compatible',executionMode:'plain',reasoningForcedOff:false,modelRoute:'fixture',routeDegraded:false};
function fixture(t){
 assert.equal(typeof api.createKernelPromptPreparer,'function','caller composition needs complete native preflight and execution fences');
 const state={window:1000000,endpoint:base.baseURL,append:'完整覆盖内容',fallback:false};const old=slots.resolveForRuntime;
 slots.resolveForRuntime=async()=>({appendBlocks:[{id:'custom_slot:fixture',group:'custom_slot',priority:999,required:true,estimatedTokens:10,content:state.append}]});t.after(()=>{slots.resolveForRuntime=old});
 const resolveModel=async(provider,options)=>({...base,provider,model:options.model,temperature:options.temperature??0.35,maxTokens:options.maxTokens,
  baseURL:state.endpoint,modelKwargs:state.kwargs,executionMode:options.executionMode??'plain',structuredStrategy:options.structuredStrategy??null,timeoutMs:options.timeoutMs,taskType:options.taskType});
 const preparer=api.createKernelPromptPreparer({resolveModel,contextWindowFor:async()=>state.window,
  readFallback:async()=>({enabled:state.fallback,provider:'openai',model:'fallback-model',temperature:0.2,maxTokens:3000,retryCount:1})});
 return{state,preparer,resolveModel,request:k.buildKernelPatchPromptRequest(patchInput())};
}
test('preflight fingerprints complete registered messages and sanitizes configuration without credentials',async t=>{
 const f=fixture(t);f.request.promptInput.chapterContent='首段。'+'完整正文。'.repeat(3000)+'尾段保留。';
 const prepared=await f.preparer.prepare(f.request),d=prepared.description;
 assert.ok(d.renderedInput.includes(f.request.promptInput.chapterContent));assert.ok(d.renderedInput.includes('完整覆盖内容'));
 assert.equal(d.outputTokens,4200);assert.equal(d.contextWindow,1000000);assert.match(d.identity,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(d).includes('very-sensitive-api-key'),false);assert.equal(JSON.stringify(d).includes('https://models.invalid'),false);
});
test('a single-strategy profile registers the subsequent-attempt temperature for its retry',async t=>{
 const f=fixture(t),prepared=await f.preparer.prepare(f.request);
 // Structured retries reuse the last strategy past the end of the sequence
 // with min(base temperature, 0.2). The fixture profile has only
 // prompt_json, so without that registration the first retry is fenced off
 // as a configuration snapshot change instead of running.
 const configuration=await f.resolveModel('openai',{model:'fixture-model',temperature:0.2,maxTokens:4200,taskType:f.request.asset.taskType,executionMode:'structured',structuredStrategy:'prompt_json'});
 const tokens=prepared.reserveTokens({configuration,input:[{role:'user',content:'正文'}],options:{}});
 assert.ok(tokens>4200);
});
test('unknown and insufficient windows reject before any model execution',async t=>{
 const f=fixture(t);
 for(const window of [null,100]){f.state.window=window;await assert.rejects(()=>f.preparer.prepare(f.request),/上下文|context|window/i);}
});
test('published overlays, endpoint configuration and fallback settings change effective identity',async t=>{
 const f=fixture(t),first=(await f.preparer.prepare(f.request)).description.identity;
 for(const [key,value]of [['append','另一份覆盖'],['endpoint','https://other.invalid/v1'],['fallback',true]]){
  const previous=f.state[key];f.state[key]=value;assert.notEqual((await f.preparer.prepare(f.request)).description.identity,first,key);f.state[key]=previous;
 }
});
test('every retry reserves its complete current input and schema overhead against the saved model window',async t=>{
 const f=fixture(t),prepared=await f.preparer.prepare(f.request);
 const configuration=await f.resolveModel('openai',{model:'fixture-model',temperature:0.15,maxTokens:4200,taskType:f.request.asset.taskType,executionMode:'structured',structuredStrategy:'prompt_json'});
 const small=prepared.reserveTokens({configuration,input:[{role:'user',content:'正文'}],options:{}});
 const large=prepared.reserveTokens({configuration,input:[{role:'user',content:'正文'},{role:'user',content:'完整纠错报告'}],options:{response_format:{type:'json_object'}}});
 assert.ok(small>4200);assert.ok(large>small);
 await assert.rejects(()=>prepared.execute(async()=>prepared.reserveTokens({configuration,input:[{role:'user',content:'长'.repeat(400000)}],options:{}})),/上下文|context|window/i);
});
test('a resolved model or endpoint change is latched before provider construction even if native code catches it',async t=>{
 const f=fixture(t),prepared=await f.preparer.prepare(f.request);
 const configuration=await f.resolveModel('openai',{model:'fixture-model',temperature:0.15,maxTokens:4200,taskType:f.request.asset.taskType,executionMode:'structured',structuredStrategy:'prompt_json'});
 await assert.rejects(()=>prepared.execute(async()=>{try{require('../../../dist/llm/factory').createLLMFromResolvedOptions({...configuration,baseURL:'https://changed.invalid'})}catch{}return'swallowed';}),/snapshot|configuration|配置/i);
});
test('constructor-level model payloads count towards preflight and every physical reservation',async t=>{
 const f=fixture(t),plain=await f.preparer.prepare(f.request);
 const options={model:'fixture-model',temperature:0.15,maxTokens:4200,taskType:f.request.asset.taskType,executionMode:'structured',structuredStrategy:'prompt_json'};
 const normal=plain.reserveTokens({configuration:await f.resolveModel('openai',options),input:[{role:'user',content:'正文'}],options:{}});
 f.state.kwargs={tools:[{type:'function',function:{name:'context',description:'完整工具输入'.repeat(100),parameters:{type:'object'}}}]};
 const withTools=await f.preparer.prepare(f.request),larger=withTools.reserveTokens({configuration:await f.resolveModel('openai',options),input:[{role:'user',content:'正文'}],options:{}});
 assert.ok(larger>normal+1000);
 f.state.window=50000;f.state.kwargs.tools[0].function.description='完整工具输入'.repeat(10000);
 await assert.rejects(()=>f.preparer.prepare(f.request),/上下文|context|window/i);
});
test('model windows require exact explicit provider/model metadata and remain detached from later caller edits',async()=>{
 assert.equal(typeof api.createKernelModelWindowReader,'function','production composition needs an explicit metadata source');
 const entries=[{provider:'openai',model:'configured-model',contextWindow:128000}],reader=api.createKernelModelWindowReader(entries);
 entries[0].contextWindow=1;
 assert.equal(await reader('openai','configured-model'),128000);
 assert.equal(await reader('other','configured-model'),null);assert.equal(await reader('openai','configured-model-plus'),null);
 assert.equal(await api.createKernelModelWindowReader([])('openai','gpt-4'),null);
 for(const bad of [[{provider:'openai',model:'x',contextWindow:0}],[{provider:'openai',model:'x',contextWindow:1.5}],
  [{provider:'openai',model:'x',contextWindow:128000},{provider:'openai',model:'x',contextWindow:256000}]])assert.throws(()=>api.createKernelModelWindowReader(bad));
});
