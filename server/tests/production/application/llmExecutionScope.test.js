const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../../dist/platform/llm/execution/index.js');
const api=fs.existsSync(file)?require(file):{};
const resolved={provider:'openai',providerName:'fixture',model:'model-a',temperature:0.2,maxTokens:4200,apiKey:'fixture-secret',baseURL:'http://127.0.0.1:1',authMode:'bearer',requestProtocol:'openai_compatible',executionMode:'plain',concurrencyLimit:0,requestIntervalMs:0,reasoningEnabled:false,reasoningEffort:null,includeRawResponse:false,reasoningForcedOff:false};
const fallback={enabled:true,provider:'openai',model:'model-b',temperature:0.2,maxTokens:3000,retryCount:1};
function fixture(){
 assert.equal(typeof api.withLlmExecutionPolicy,'function','caller-owned execution snapshots require an async policy scope');
 assert.equal(typeof api.attachLlmExecutionPolicy,'function','resolved clients must check the current request policy');
 let calls=0;const raw={invoke:async()=>{calls++;return{content:'saved response'}},stream:async()=>{calls++;return{async *[Symbol.asyncIterator](){yield{content:'saved response'}}}},batch:async inputs=>{calls+=inputs.length;return inputs.map(()=>({content:'response'}))}};
 return{llm:api.attachLlmExecutionPolicy(raw,resolved),get calls(){return calls},policy:{fallback,assertConfiguration:()=>{},assertRequest:()=>{}}};
}
test('resolved model drift is rejected before client construction or provider dispatch',async()=>{
 const f=fixture();f.policy.assertConfiguration=config=>{assert.equal(config.model,'model-b','frozen model differs')};
 await assert.rejects(()=>api.withLlmExecutionPolicy(f.policy,async()=>{
  const {createLLMFromResolvedOptions}=require('../../../dist/llm/factory');createLLMFromResolvedOptions(resolved);
 }),/frozen model differs/);assert.equal(f.calls,0);
});
test('full physical request validation runs before invoke and stream side effects',async()=>{
 for(const method of ['invoke','stream']){
  const f=fixture();f.policy.assertRequest=(_config,request)=>{assert.equal(request.input[0].content,'全文');throw new Error('full input exceeds window')};
  await assert.rejects(()=>api.withLlmExecutionPolicy(f.policy,()=>f.llm[method]([{role:'user',content:'全文'}],{response_format:{type:'json_object'}})),/exceeds window/);assert.equal(f.calls,0);
 }
});
test('native error handling cannot swallow a latched execution-policy failure',async()=>{
 const f=fixture();f.policy.assertRequest=()=>{throw new Error('snapshot changed')};
 await assert.rejects(()=>api.withLlmExecutionPolicy(f.policy,async()=>{try{await f.llm.invoke('input')}catch{}return{fallback:true}}),/snapshot changed/);assert.equal(f.calls,0);
});
test('the native fallback reader uses a detached caller snapshot and performs no settings query',async()=>{
 const f=fixture(),{getStructuredFallbackSettings}=require('../../../dist/llm/structuredFallbackSettings');
 await api.withLlmExecutionPolicy(f.policy,async()=>{
  const saved=await getStructuredFallbackSettings(true);assert.deepEqual(saved,fallback);saved.model='mutated';
  assert.equal((await getStructuredFallbackSettings()).model,'model-b');
 });assert.equal(f.calls,0);
});
test('clients retain existing behavior outside a policy and concurrent scopes do not share rejection state',async()=>{
 const f=fixture();assert.equal((await f.llm.invoke('outside')).content,'saved response');
 const rejected={...f.policy,assertRequest:()=>{throw new Error('scope rejected')}};
 const outcomes=await Promise.allSettled([api.withLlmExecutionPolicy(f.policy,()=>f.llm.invoke('allowed')),api.withLlmExecutionPolicy(rejected,()=>f.llm.invoke('denied'))]);
 assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.equal(f.calls,2);
});
