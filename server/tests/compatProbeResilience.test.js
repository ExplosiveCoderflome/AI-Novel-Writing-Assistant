const test = require("node:test");
const assert = require("node:assert/strict");

const fixtures = require("./fixtures/modelCompatibility.json");
const compat = require("../dist/llm/compatibility/index.js");
const factory = require("../dist/llm/factory.js");
const { probeModel } = require("../dist/llm/compatibility/probing.js");
const { resolveProviderReasoningBehavior } = require("../dist/llm/reasoning.js");

const identity = (name) => ({ provider: "custom_" + name, model: name, baseURL: "https://fixture.invalid/v1" });
const stream = async function* (chunks) { for (const chunk of chunks) yield chunk; };

function mockClients(t, handler) {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  t.after(() => { factory.resolveLLMClientOptions = originalResolve; factory.createLLMFromResolvedOptions = originalCreate; });
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

// Regression: a rate-limited endpoint must not kill the whole probe. Burst
// 429s are transient; the probe retries them and still learns the modes.
test("probe retries rate-limited requests and still learns the modes", async (t) => {
  const input = identity("probe-retry-429");
  let requests = 0;
  mockClients(t, (resolved, messages, options) => {
    requests += 1;
    if (requests <= 2) throw Object.assign(new Error("rate limited"), { status: 429 });
    return stream(options.tools ? fixtures.tool : fixtures.ok);
  });
  const result = await probeModel(input, { allowNetwork: true, requestDelayMs: 0 });
  assert.equal(requests, 6);
  assert.deepEqual(result.structuredModes, ["json_schema", "json_object", "tool_calling", "prompt_only"]);
  assert.deepEqual(result.failedModes, []);
});

// Regression: persistent rate limits still fail the probe, but only after the
// retries are spent, and never poison the stored capability modes.
test("persistent rate limits fail the probe after retries without poisoning modes", async (t) => {
  const input = identity("probe-persistent-429");
  await saveModes(input, ["json_schema", "prompt_only"]);
  let requests = 0;
  mockClients(t, () => {
    requests += 1;
    throw Object.assign(new Error("rate limited"), { status: 429 });
  });
  await assert.rejects(probeModel(input, { allowNetwork: true, requestDelayMs: 0 }));
  assert.equal(requests, 3);
  assert.deepEqual(compat.resolveCapability(input).structuredModes, ["json_schema", "prompt_only"]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, []);
});

// Regression: auth failures are not transient and must not be retried.
test("auth failures fail the probe immediately without retries", async (t) => {
  const input = identity("probe-no-retry-401");
  await saveModes(input, ["json_object", "prompt_only"]);
  let requests = 0;
  mockClients(t, () => {
    requests += 1;
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  });
  await assert.rejects(probeModel(input, { allowNetwork: true, requestDelayMs: 0 }));
  assert.equal(requests, 1);
  assert.deepEqual(compat.resolveCapability(input).failedModes, []);
});

// Regression: a thinking model must survive the probe budget. When the model
// spends its output budget on reasoning before emitting JSON, a 128-token
// probe sees only a truncation; the probe budget must leave room for the
// answer itself.
test("probe budget leaves room for the answer behind model reasoning", async (t) => {
  const input = identity("probe-thinking-budget");
  mockClients(t, (resolved, messages, options) => {
    if (resolved.maxTokens <= 128) {
      return stream([{ content: '{"ok":', response_metadata: { finish_reason: "length" } }]);
    }
    return stream(options.tools ? fixtures.tool : fixtures.ok);
  });
  const result = await probeModel(input, { allowNetwork: true, requestDelayMs: 0 });
  assert.deepEqual(result.structuredModes, ["json_schema", "json_object", "tool_calling", "prompt_only"]);
});

// Regression: probe requests are paced so a burst of trials does not trip a
// per-second rate limit on the endpoint.
test("probe requests are paced apart", async (t) => {
  const input = identity("probe-pacing");
  const at = [];
  mockClients(t, (resolved, messages, options) => {
    at.push(Date.now());
    return stream(options.tools ? fixtures.tool : fixtures.ok);
  });
  await probeModel(input, { allowNetwork: true, requestDelayMs: 60 });
  assert.equal(at.length, 4);
  for (let i = 1; i < at.length; i += 1) {
    assert.ok(at[i] - at[i - 1] >= 40, `gap ${i} was ${at[i] - at[i - 1]}ms`);
  }
});
