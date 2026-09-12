const test = require("node:test");
const assert = require("node:assert/strict");

const { createLLMFromResolvedOptions } = require("../dist/llm/factory.js");

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
