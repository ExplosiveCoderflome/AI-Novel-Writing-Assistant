const test = require("node:test");
const assert = require("node:assert/strict");

const { createLLMFromResolvedOptions, resolveLLMClientOptions, setProviderSecretCache } = require("../dist/llm/factory.js");

test("Ollama saved thinking-off reaches SDK request parameters in text and structured modes", async (t) => {
  setProviderSecretCache("ollama", { model: "qwen3.5:9b", baseURL: "http://127.0.0.1:11434/v1", reasoningEnabled: false });
  t.after(() => setProviderSecretCache("ollama", null));
  for (const executionMode of ["plain", "structured"]) {
    const resolved = await resolveLLMClientOptions("ollama", { model: "qwen3.5:9b", executionMode, maxTokens: 3200 });
    const llm = createLLMFromResolvedOptions(resolved);
    const body = llm.invocationParams({});
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_tokens, 3200);
    assert.equal(body.think, undefined);
    assert.equal(body.enable_thinking, undefined);
  }
});

test("OpenAI-compatible clients leave retries to explicit product workflows", () => {
  const llm = createLLMFromResolvedOptions({
    provider: "custom",
    providerName: "Custom",
    model: "test-model",
    temperature: 0.2,
    baseURL: "http://127.0.0.1:1/v1",
    authMode: "none",
    concurrencyLimit: 1,
    requestIntervalMs: 0,
    reasoningEnabled: false,
    reasoningEffort: null,
    includeRawResponse: false,
    requestProtocol: "openai",
    executionMode: "text",
    structuredProfile: null,
    structuredStrategy: null,
    reasoningForcedOff: false,
  });

  assert.equal(llm.caller.maxRetries, 0);
});
