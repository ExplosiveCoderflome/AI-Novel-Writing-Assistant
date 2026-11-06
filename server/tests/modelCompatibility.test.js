const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { rows } = require("./fixtures/compatibilitySettings.cjs");
const fixtures = require("./fixtures/modelCompatibility.json");
const compat = require("../dist/llm/compatibility/index.js");
const factory = require("../dist/llm/factory.js");
const { probeModel, setAutoProbe, autoProbeEnabled, probeIfEnabled, probeStatus } = require("../dist/llm/compatibility/probing.js");
const { resolveProviderReasoningBehavior, ReasoningStreamCollector } = require("../dist/llm/reasoning.js");
const { resolveStructuredOutputProfile, structuredStrategySequence } = require("../dist/llm/structuredOutput.js");
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
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

test("builtins cover common families and Spark MaaS defaults to prompt-only", () => {
  for (const provider of ["deepseek", "qwen", "glm", "kimi", "openai", "anthropic", "gemini", "minimax", "grok"]) {
    assert.notEqual(compat.resolveCapability({ provider }).family, "unknown", provider);
  }
  const spark = { provider: "custom_xfyun", model: "spark-x2.6", baseURL: "https://maas-api.cn-huabei-1.xf-yun.com/v1" };
  assert.deepEqual(compat.resolveCapability(spark).structuredModes, ["prompt_only"]);
  assert.deepEqual(structuredStrategySequence(resolveStructuredOutputProfile(spark), schema), ["prompt_json"]);
  assert.deepEqual(compat.resolveCapability(identity("unknown")).structuredModes, ["prompt_only"]);
});

test("user override wins over a later probe; host isolation and hostless override are preserved", async () => {
  const input = identity("precedence");
  await saveModes(input, ["tool_calling", "prompt_only"]);
  await saveModes(input, ["json_schema", "prompt_only"], "probed");
  assert.equal(compat.resolveCapability(input).source, "user_override");
  assert.equal(compat.resolveCapability(input).structuredModes[0], "tool_calling");
  assert.equal(compat.resolveCapability({ ...input, baseURL: "https://other.invalid" }).source, "builtin_default");
  await saveModes({ ...input, baseURL: undefined }, ["json_object", "prompt_only"]);
  assert.equal(compat.resolveCapability({ ...input, baseURL: "https://other.invalid" }).source, "user_override");
  const freshStore = require.resolve("../dist/llm/compatibility/store.js");
  delete require.cache[freshStore];
  const reloaded = require(freshStore);
  assert.equal((await reloaded.loadCapability(input)).structuredModes[0], "tool_calling");
});

test("fallback tries schema, object, tool, prompt; persisted failures are skipped on the next invocation", async (t) => {
  const input = identity("fallback-chain");
  await saveModes(input, ["json_schema", "json_object", "tool_calling", "prompt_only"]);
  const calls = [];
  mockClients(t, (resolved) => {
    calls.push(resolved.structuredStrategy);
    if (resolved.structuredStrategy === "tool_calling") throw new Error("tool_choice not supported");
    if (resolved.structuredStrategy !== "prompt_json") throw Object.assign(new Error(fixtures.unsupported.message), { status: 400 });
    return stream(fixtures.ok);
  });
  const invoke = () => invokeStructuredLlmDetailed({ ...input, schema, label: "compat.fixture.chain", systemPrompt: "JSON", userPrompt: "ok", disableFallbackModel: true, maxRepairAttempts: 0 });
  assert.deepEqual((await invoke()).data, { ok: true });
  assert.deepEqual(calls, ["json_schema", "json_object", "tool_calling", "prompt_json"]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, ["json_schema", "json_object", "tool_calling"]);
  const stored = [...rows.values()].map((value) => { try { return JSON.parse(value); } catch { return null; } }).find((value) => value?.failedModes?.length === 3);
  assert.ok(stored);
  calls.length = 0;
  await invoke();
  assert.deepEqual(calls, ["prompt_json"]);
});

test("tool call arguments stream into Zod and stop the chain on success", async (t) => {
  const input = identity("tool-success");
  await saveModes(input, ["tool_calling", "prompt_only"]);
  const calls = [];
  mockClients(t, (resolved, messages, options) => {
    calls.push(resolved.structuredStrategy);
    assert.equal(options.tools[0].function.name, "structured_output");
    assert.equal(options.tool_choice.function.name, "structured_output");
    return stream(fixtures.tool);
  });
  const result = await invokeStructuredLlmDetailed({ ...input, schema, label: "compat.fixture.tool", systemPrompt: "JSON", userPrompt: "ok", disableFallbackModel: true });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(calls, ["tool_calling"]);
});

test("prompt and tool validation failures each reuse exactly one repair with schema feedback", async (t) => {
  mockClients(t, () => stream(fixtures.invalid));
  let repairs = 0;
  factory.getLLM = async () => ({ stream: async (messages) => {
    repairs += 1;
    assert.match(messages.map((message) => message.content).join(""), /ok/);
    return stream(fixtures.ok);
  } });
  for (const mode of ["prompt_only", "tool_calling"]) {
    const input = identity("repair-" + mode);
    await saveModes(input, [mode, "prompt_only"]);
    if (mode === "tool_calling") factory.createLLMFromResolvedOptions = () => ({ stream: async () => stream([{ content: "", tool_call_chunks: [{ index: 0, args: '{"wrong":false}' }] }]) });
    const result = await invokeStructuredLlmDetailed({ ...input, schema, label: "compat.fixture.repair", systemPrompt: "JSON", userPrompt: "ok", disableFallbackModel: true });
    assert.equal(result.repairAttempts, 1);
    assert.deepEqual(result.data, { ok: true });
  }
  assert.equal(repairs, 2);
});

test("MaaS mode-specific transport rejection falls back and persists the failed mode", async (t) => {
  const input = { provider: "custom_spark_fixture", model: "spark-x2.6", baseURL: "https://maas-api.cn-huabei-1.xf-yun.com/v1" };
  await saveModes(input, ["json_object", "prompt_only"], "probed");
  const calls = [];
  mockClients(t, (resolved) => {
    calls.push(resolved.structuredStrategy);
    if (resolved.structuredStrategy === "json_object") throw Object.assign(new Error(fixtures.sparkTransport.message), { status: 400 });
    return stream(fixtures.ok);
  });
  assert.deepEqual((await invokeStructuredLlmDetailed({ ...input, schema, label: "compat.fixture.spark", systemPrompt: "JSON", userPrompt: "ok", disableFallbackModel: true })).data, { ok: true });
  assert.deepEqual(calls, ["json_object", "prompt_json"]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, ["json_object"]);
});

test("vendor/deepseek-v4.1-flash off removes the reasoning request path and accepts content without reasoning", () => {
  const behavior = resolveProviderReasoningBehavior({ provider: "custom_deepseek_fixture", model: "vendor/deepseek-v4.1-flash", baseURL: "https://fixture.invalid/v1", reasoningEnabled: false, reasoningEffort: "max" });
  assert.deepEqual(behavior.modelKwargs, { thinking: { type: "disabled" } });
  assert.equal(behavior.reasoningEffort, null);
  const collector = new ReasoningStreamCollector();
  assert.equal(collector.push(fixtures.ok[0], fixtures.ok[0].content) + collector.flush(), "");
});

test("probes require opt-in, use cheap-first trials, save supported modes and verify thinking-off", async (t) => {
  const input = { ...identity("probe"), model: "vendor/deepseek-v4.1-flash" };
  const calls = [];
  mockClients(t, (resolved, messages, options) => {
    calls.push(options.response_format?.type ?? (options.tools ? "tool_calling" : "prompt_only"));
    assert.deepEqual(resolved.modelKwargs, { thinking: { type: "disabled" } });
    assert.equal(resolved.maxTokens, 128);
    return stream(options.tools ? fixtures.tool : fixtures.ok);
  });
  await assert.rejects(probeModel(input, { allowNetwork: false }), /opt-in/);
  assert.equal(calls.length, 0);
  const result = await probeModel(input, { allowNetwork: true });
  assert.deepEqual(calls, ["json_object", "json_schema", "tool_calling", "prompt_only"]);
  assert.deepEqual(result.structuredModes, ["json_schema", "json_object", "tool_calling", "prompt_only"]);
  assert.equal(result.thinkingToggle.supported, true);
  assert.ok(result.probedAt);
  assert.equal(result.source, "probed");
});

test("unknown service thinking control is learned from reasoning-on/off fixture evidence", async (t) => {
  const input = identity("thinking-discovery");
  mockClients(t, (resolved, messages, options) => stream(options.tools ? fixtures.tool : resolved.modelKwargs?.enable_thinking === false ? fixtures.ok : fixtures.thinking));
  const result = await probeModel(input, { allowNetwork: true });
  assert.equal(result.thinkingToggle.supported, true);
  assert.equal(result.thinkingToggle.control, "enable_thinking");
  assert.equal(result.reasoningField, "reasoning_content");
});

test("auth and rate limits do not poison capability modes; automatic probes stay opt-in", async (t) => {
  const input = identity("auth-failure");
  await saveModes(input, ["json_object", "prompt_only"], "probed");
  let requests = 0;
  mockClients(t, () => { requests += 1; throw Object.assign(new Error("API key should never appear in output"), { status: 401 }); });
  await probeIfEnabled(input);
  assert.equal(requests, 0);
  await assert.rejects(probeModel(input, { allowNetwork: true }));
  assert.deepEqual(compat.resolveCapability(input).failedModes, []);
  await setAutoProbe(input.provider, true);
  assert.equal(await autoProbeEnabled(input.provider), true);
  await probeIfEnabled(input);
  for (let tick = 0; tick < 30 && (await probeStatus(input)).state === "running"; tick += 1) await new Promise(setImmediate);
  const status = await probeStatus(input);
  assert.equal(status.state, "failed");
  assert.doesNotMatch(status.message, /API key/);
});

test("concurrent mode failures accumulate without losing a persisted failure", async () => {
  const input = identity("concurrent");
  await saveModes(input, ["json_schema", "json_object", "tool_calling", "prompt_only"], "probed");
  await Promise.all([compat.recordFailedMode(input, "json_schema"), compat.recordFailedMode(input, "json_object")]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, ["json_schema", "json_object"]);
});

test("generic transport errors, auth and rate limits do not become mode failures", () => {
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: "[STRUCTURED_OUTPUT:transport_error] primary structured output failed" }), false);
  for (const httpStatus of [401, 403, 429]) {
    assert.equal(compat.implicatesStructuredMode({ category: "unsupported_native_json", message: "response_format rejected", httpStatus }), false);
  }
  assert.equal(compat.implicatesStructuredMode({ category: "malformed_json", message: "unexpected token", failureReason: "output_budget_exhausted" }), false);
  assert.equal(compat.implicatesStructuredMode({ category: "transport_error", message: fixtures.sparkTransport.message }), true);
});

test("raw LangChain deltas preserve reasoning evidence during a probe", async (t) => {
  const input = identity("raw-reasoning");
  mockClients(t, (resolved, messages, options) => {
    assert.equal(resolved.includeRawResponse, true);
    if (options.tools) return stream(fixtures.tool);
    return stream([{ content: '{"ok":true}', additional_kwargs: { __raw_response: { choices: [{ delta: { reasoning_content: "Still thinking despite the flag." } }] } } }]);
  });
  const result = await probeModel(input, { allowNetwork: true });
  assert.equal(result.thinkingToggle.supported, false);
  assert.equal(result.reasoningField, "reasoning_content");
});

test("a transient probe network error preserves the last successful profile", async (t) => {
  const input = identity("probe-outage");
  await saveModes(input, ["json_schema", "prompt_only"], "probed");
  mockClients(t, () => { throw new TypeError("fetch failed"); });
  await assert.rejects(probeModel(input, { allowNetwork: true }));
  assert.deepEqual(compat.resolveCapability(input).structuredModes, ["json_schema", "prompt_only"]);
  assert.deepEqual(compat.resolveCapability(input).failedModes, []);
});

test("unusable native probe results select prompt-only after a valid plain response", async (t) => {
  const input = identity("probe-native-empty");
  mockClients(t, (resolved, messages, options) => stream(options.response_format || options.tools ? [] : fixtures.ok));
  const result = await probeModel(input, { allowNetwork: true });
  assert.deepEqual(result.structuredModes, ["prompt_only"]);
  assert.deepEqual(result.failedModes, ["json_object", "json_schema", "tool_calling"]);
});

test("adding prompt JSON constraints preserves caller messages and their cache boundary", async (t) => {
  const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
  const { declarePromptCacheBoundary, getPromptCacheBoundary } = require("../dist/platform/llm/cache/index.js");
  const input = identity("prompt-immutable");
  const messages = [new SystemMessage("Return JSON"), new HumanMessage("ok")];
  declarePromptCacheBoundary(messages, { messageIndex: 0 });
  mockClients(t, (resolved, received) => {
    assert.notEqual(received, messages);
    assert.equal(received.length, 3);
    assert.equal(getPromptCacheBoundary(received).messageIndex, 0);
    return stream(fixtures.ok);
  });
  await invokeStructuredLlmDetailed({ ...input, messages, schema, label: "compat.fixture.immutable", disableFallbackModel: true });
  assert.equal(messages.length, 2);
});

test("settings endpoints require network consent, resolve the configured host and save an override", async (t) => {
  const express = require("express");
  const { once } = require("node:events");
  const { registerModelCompatibilityRoutes } = require("../dist/llm/compatibility/http.js");
  const probing = require("../dist/llm/compatibility/probe.js");
  const { errorHandler } = require("../dist/middleware/errorHandler.js");
  const input = identity("settings-http");
  const originalResolve = factory.resolveLLMClientOptions;
  const originalStart = probing.startProbe;
  let requested;
  factory.resolveLLMClientOptions = async () => ({ ...input });
  probing.startProbe = async (identity, consent) => { requested = { identity, consent }; };
  t.after(() => { factory.resolveLLMClientOptions = originalResolve; probing.startProbe = originalStart; });
  const app = express();
  app.use(express.json());
  registerModelCompatibilityRoutes(app);
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/model-compat/${input.provider}`;
  const send = (method, path, body) => fetch(url + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const denied = await send("POST", "/probe", { model: input.model });
  assert.equal(denied.status, 400);
  assert.equal(requested, undefined);
  const accepted = await send("POST", "/probe", { model: input.model, allowNetwork: true });
  assert.equal(accepted.status, 202);
  assert.equal(requested.identity.baseURL, input.baseURL);
  assert.equal(requested.consent, true);
  const override = { ...compat.builtinCapability(input), structuredModes: ["tool_calling", "prompt_only"] };
  assert.equal((await send("PUT", "", { override })).status, 200);
  const result = await (await fetch(url)).json();
  assert.equal(result.data.profile.source, "user_override");
  assert.equal(result.data.profile.structuredModes[0], "tool_calling");
  assert.equal(result.data.autoProbe, false);
});
