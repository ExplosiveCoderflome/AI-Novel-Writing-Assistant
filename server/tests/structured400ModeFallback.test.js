require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const compat = require("../dist/llm/compatibility/index.js");
const factory = require("../dist/llm/factory.js");
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
const { resolveProviderReasoningBehavior } = require("../dist/llm/reasoning.js");
const { emptyResponseEvidence, classifyResponseEvidence } = require("../dist/platform/llm/diagnostics/structuredEvidence.js");

const schema = z.object({ ok: z.literal(true) });
const identity = (name) => ({ provider: "custom_" + name, model: name, baseURL: "https://fixture.invalid/v1" });
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

async function saveModes(input, modes, source = "user_override") {
  return compat.saveCapability(input, { ...compat.builtinCapability(input), structuredModes: modes, source });
}

// Regression: a bare HTTP 400 ("inference request is invalid", no response_format
// wording, no status field on the error object) used to be classified as a generic
// transport error, so the chain retried the same rejected json_schema strategy
// until the budget ran out instead of falling back to the next strategy.
test("a bare 400/422 rejection implicates the structured mode", () => {
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "400 inference request is invalid", httpStatus: 400 }), true);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "400 inference request is invalid" }), true);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "422 Unprocessable Entity", httpStatus: 422 }), true);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "Request failed with status code 422: unprocessable content" }), true);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "[STRUCTURED_OUTPUT:transport_error] primary structured output failed" }), false);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "socket hang up" }), false);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "500 internal error", httpStatus: 500 }), false);
});

test("the chain falls back to the next strategy when json_schema gets a bare 400", async (t) => {
  const input = identity("bare-400-fallback");
  await saveModes(input, ["json_schema", "json_object", "prompt_only"], "probed");
  const calls = [];
  mockClients(t, (resolved) => {
    calls.push(resolved.structuredStrategy);
    if (resolved.structuredStrategy === "json_schema") throw new Error("400 inference request is invalid");
    return stream([{ content: '{"ok":true}' }]);
  });
  const result = await invokeStructuredLlmDetailed({
    ...input, schema, label: "bare.400.fallback", systemPrompt: "JSON", userPrompt: "ok",
    disableFallbackModel: true, maxRepairAttempts: 0,
  });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(calls, ["json_schema", "json_object"]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, ["json_schema"]);
});

test("response evidence recovers an HTTP status carried only in the error message", () => {
  const evidence400 = emptyResponseEvidence();
  classifyResponseEvidence(evidence400, new Error("400 inference request is invalid"), "transport_error");
  assert.equal(evidence400.httpStatus, 400);
  const evidence422 = emptyResponseEvidence();
  classifyResponseEvidence(evidence422, new Error("[STRUCTURED_OUTPUT:transport_error] 422 Unprocessable Entity"), "transport_error");
  assert.equal(evidence422.httpStatus, 422);
  const evidencePlain = emptyResponseEvidence();
  classifyResponseEvidence(evidencePlain, new Error("socket hang up"), "transport_error");
  assert.equal(evidencePlain.httpStatus, null);
});
