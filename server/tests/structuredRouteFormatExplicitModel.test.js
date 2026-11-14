require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const compat = require("../dist/llm/compatibility/index.js");
const factory = require("../dist/llm/factory.js");
const { prisma } = require("../dist/db/prisma.js");
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
const { resolveProviderReasoningBehavior } = require("../dist/llm/reasoning.js");

const schema = z.object({ ok: z.literal(true) });
const stream = async function* (chunks) { for (const chunk of chunks) yield chunk; };

function mockClients(t, handler) {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const originalGet = factory.getLLM;
  t.after(() => { factory.resolveLLMClientOptions = originalResolve; factory.createLLMFromResolvedOptions = originalCreate; factory.getLLM = originalGet; });
  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    provider, providerName: provider, model: options.model, baseURL: options.baseURL,
    temperature: 0.2, authMode: "none", concurrencyLimit: 0, requestIntervalMs: 0,
    requestProtocol: "openai_compatible", structuredStrategy: options.structuredStrategy,
    executionMode: options.executionMode ?? "plain", maxTokens: options.maxTokens,
    reasoningEnabled: options.reasoningEnabled ?? false,
    ...resolveProviderReasoningBehavior({ provider, model: options.model, baseURL: options.baseURL, reasoningEnabled: options.reasoningEnabled ?? false }),
  });
  factory.createLLMFromResolvedOptions = (resolved) => ({ stream: async (messages, options) => handler(resolved, messages, options) });
}

async function saveModes(input, modes, source = "probed") {
  return compat.saveCapability(input, { ...compat.builtinCapability(input), structuredModes: modes, source });
}

function stubRouteRow(t, row) {
  const original = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => row;
  t.after(() => { prisma.modelRouteConfig.findUnique = original; });
}

// Regression: the model-route "structured format" setting was silently ignored
// for callers that pass an explicit provider/model (the director always does),
// because the route preference was only resolved when both were absent. A route
// whose identity matches the call must contribute its format.
test("a matching route format applies even with an explicit provider and model", async (t) => {
  const input = { provider: "custom_route_fmt", model: "route-fmt", baseURL: "https://fixture.invalid/v1" };
  await saveModes(input, ["json_schema", "json_object", "prompt_only"]);
  stubRouteRow(t, {
    provider: "custom_route_fmt", model: "route-fmt", temperature: 0.2, maxTokens: null,
    requestProtocol: "auto", structuredResponseFormat: "prompt_json",
  });
  const calls = [];
  mockClients(t, (resolved) => {
    calls.push(resolved.structuredStrategy);
    return stream([{ content: '{"ok":true}' }]);
  });
  const result = await invokeStructuredLlmDetailed({
    ...input, schema, label: "route.format.explicit", systemPrompt: "JSON", userPrompt: "ok",
    taskType: "planner", disableFallbackModel: true, maxRepairAttempts: 0,
  });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(calls, ["prompt_json"]);
});

test("a route format does not leak to a different provider/model identity", async (t) => {
  const input = { provider: "custom_other_ident", model: "other-ident", baseURL: "https://fixture.invalid/v1" };
  await saveModes(input, ["json_schema", "json_object", "prompt_only"]);
  stubRouteRow(t, {
    provider: "custom_route_fmt", model: "route-fmt", temperature: 0.2, maxTokens: null,
    requestProtocol: "auto", structuredResponseFormat: "prompt_json",
  });
  const calls = [];
  mockClients(t, (resolved) => {
    calls.push(resolved.structuredStrategy);
    return stream([{ content: '{"ok":true}' }]);
  });
  const result = await invokeStructuredLlmDetailed({
    ...input, schema, label: "route.format.mismatch", systemPrompt: "JSON", userPrompt: "ok",
    taskType: "planner", disableFallbackModel: true, maxRepairAttempts: 0,
  });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(calls, ["json_schema"]);
});
