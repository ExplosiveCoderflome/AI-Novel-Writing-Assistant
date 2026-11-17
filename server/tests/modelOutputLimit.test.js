const { rows } = require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { saveCapability, loadCapability, builtinCapability, capabilityProfileSchema } = require("../dist/llm/compatibility");
const { resolveLLMClientOptions, createLLMFromResolvedOptions, setProviderSecretCache } = require("../dist/llm/factory");
const { withLlmTaskOutputBudgets } = require("../dist/platform/llm/execution");
const router = require("../dist/llm/modelRouter");

test("model output limits persist, isolate models/endpoints and reach plain and structured SDK requests", async (t) => {
  const provider = "custom_output_limit";
  const resolveModel = router.resolveModel;
  router.resolveModel = async (task) => ({ provider, model: "model-a", routeKey: task, maxTokens: 8192 });
  t.after(() => { router.resolveModel = resolveModel; });
  const identity = { provider, model: "model-a", baseURL: "https://output.invalid/v1" };
  setProviderSecretCache(provider, { model: identity.model, baseURL: identity.baseURL, key: "fixture" });
  t.after(() => setProviderSecretCache(provider, null));
  const profile = { ...builtinCapability(identity), source: "user_override", maxOutputTokens: 32768 };
  await saveCapability(identity, profile);
  assert.equal((await loadCapability(identity)).maxOutputTokens, 32768);
  assert.ok([...rows.values()].some((value) => JSON.parse(value).maxOutputTokens === 32768));
  for (const executionMode of ["plain", "structured"]) {
    const options = await resolveLLMClientOptions(provider, { maxTokens: 8192, executionMode, structuredStrategy: "json_object" });
    assert.equal(options.maxTokens, 8192);
    assert.equal(createLLMFromResolvedOptions(options).invocationParams({}).max_tokens, 8192);
  }
  const bounded = await resolveLLMClientOptions(provider, { automaticMaxTokens: 50000 });
  assert.equal(bounded.maxTokens, 32768);
  assert.equal(bounded.budgetTrace.source, "endpoint");
  assert.equal(bounded.budgetTrace.automaticMaxTokens, 50000);
  assert.equal((await resolveLLMClientOptions(provider, { model: "model-b", maxTokens: 4096 })).maxTokens, 4096);
  assert.equal((await resolveLLMClientOptions(provider, { baseURL: "https://other.invalid/v1", maxTokens: 4096 })).maxTokens, 4096);
  const scoped = await withLlmTaskOutputBudgets([{ provider, model: identity.model, taskType: "review", maxTokens: 2048 }],
    () => resolveLLMClientOptions(provider, { taskType: "review" }));
  assert.equal(scoped.maxTokens, 2048);
  await saveCapability(identity, { ...profile, maxOutputTokens: undefined });
  assert.equal((await resolveLLMClientOptions(provider, { maxTokens: 4096 })).maxTokens, 4096);
});

test("output limit validation accepts old profiles and rejects invalid limits", () => {
  const profile = builtinCapability({ provider: "ollama", model: "test" });
  assert.equal(capabilityProfileSchema.parse(profile).maxOutputTokens, undefined);
  for (const maxOutputTokens of [0, -1, 1.5, 1048577]) {
    assert.equal(capabilityProfileSchema.safeParse({ ...profile, maxOutputTokens }).success, false);
  }
});

test("structure defaults to thinking off and leaves room for mandatory reasoning without raising a user cap", async t => {
  const provider = "custom_thinking_budget", model = "fixture-thinking", baseURL = "https://thinking.invalid/v1";
  const identity = { provider, model, baseURL };
  setProviderSecretCache(provider, { model, baseURL, key: "fixture", reasoningEnabled: true });
  t.after(() => setProviderSecretCache(provider, null));
  const structured = { executionMode: "structured", structuredStrategy: "prompt_json" };
  assert.equal((await resolveLLMClientOptions(provider, structured)).reasoningEnabled, false);
  assert.equal((await resolveLLMClientOptions(provider)).reasoningEnabled, true);
  await saveCapability(identity, { ...builtinCapability(identity), source: "probed", reasoningRequired: true });
  const automatic = await resolveLLMClientOptions(provider, structured);
  assert.equal(automatic.maxTokens, 24576);
  assert.equal(automatic.budgetTrace.reasoningReserveTokens, 8192);
  assert.equal((await resolveLLMClientOptions(provider, { ...structured, maxTokens: 16384 })).maxTokens, 16384);
});

test("Gemini uses its documented structured thinking control for optional and mandatory families", async t => {
  setProviderSecretCache("gemini", { key: "fixture", reasoningEnabled: true });
  t.after(() => setProviderSecretCache("gemini", null));
  const common = { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", executionMode: "structured" };
  const flash = await resolveLLMClientOptions("gemini", { ...common, model: "gemini-2.5-flash" });
  const pro = await resolveLLMClientOptions("gemini", { ...common, model: "gemini-2.5-pro" });
  assert.equal(flash.modelKwargs.reasoning_effort, "none");
  assert.equal(flash.maxTokens, 16384);
  assert.equal(pro.modelKwargs.reasoning_effort, "low");
  assert.equal(pro.maxTokens, 24576);
  assert.equal(pro.reasoningEnabled, true);
});
