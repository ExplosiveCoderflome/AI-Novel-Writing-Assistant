require("./fixtures/compatibilitySettings.cjs");
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
 }),error=>error.code==='llm_output_budget_capture_missing' && error.message.includes('other/fixture') && error.message.includes('review'));
});

test("a saved 8K automatic policy remains valid after the default increases to 16K", async t => {
  const { configurationKey, matchSavedKernelBudget } = require("../dist/app/director/productionKernel/prompts/preflight");
  factory.setProviderSecretCache("custom_legacy_budget", { key: "fixture", model: "fixture", baseURL: "https://legacy.invalid/v1" });
  t.after(() => factory.setProviderSecretCache("custom_legacy_budget", null));
  const target = await factory.resolveLLMClientOptions("custom_legacy_budget", { model: "fixture", taskType: "writer" });
  assert.equal(target.maxTokens, 16384);
  const saved = configurationKey({ ...target, maxTokens: 8192 });
  assert.equal(matchSavedKernelBudget(target, saved).maxTokens, 8192);
  const changed = { ...target, temperature: 0.9 };
  assert.equal(matchSavedKernelBudget(changed, saved).maxTokens, 16384);
});
