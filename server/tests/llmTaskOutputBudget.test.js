const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../dist/llm/factory');
const execution=require('../dist/platform/llm/execution');
const router=require('../dist/llm/modelRouter');
test('a caller-owned output budget reaches physical SDK parameters without altering concurrent legacy calls',async t=>{
 assert.equal(typeof execution.withLlmTaskOutputBudgets,'function');
 const original=router.resolveModel;
 router.resolveModel=async(task,options)=>({provider:options.provider??'custom',model:options.model??'fixture',temperature:0.2,
  maxTokens:options.maxTokens??8192,requestProtocol:'openai_compatible',structuredResponseFormat:'prompt_json',routeKey:task,routeDegraded:false});
 factory.setProviderSecretCache('custom',{key:'fixture-key',baseURL:'https://models.invalid/v1',model:'fixture',reasoningEnabled:false});
 t.after(()=>{router.resolveModel=original;factory.setProviderSecretCache('custom',null);});
 const call=async()=>{
  const configuration=await factory.resolveLLMClientOptions('custom',{model:'fixture',taskType:'review',maxTokens:4096});
  return factory.createLLMFromResolvedOptions(configuration).invocationParams({}).max_tokens;
 };
 const result=await Promise.all([execution.withLlmTaskOutputBudgets([{provider:'custom',model:'fixture',taskType:'review',maxTokens:12000}],call),
  execution.withLlmTaskOutputBudgets([{provider:'custom',model:'fixture',taskType:'review',maxTokens:2048}],call),call()]);
 assert.deepEqual(result,[12000,2048,4096]);
});
test('a task output scope rejects unknown targets even if a compatibility catch swallows the error',async()=>{
 assert.equal(typeof execution.withLlmTaskOutputBudgets,'function');
 await assert.rejects(execution.withLlmTaskOutputBudgets([{provider:'custom',model:'fixture',taskType:'review',maxTokens:8192}],async()=>{
  try{execution.resolveScopedTaskOutputTokens('other','fixture','review',100);}catch{}
 }),/output budget/i);
});
