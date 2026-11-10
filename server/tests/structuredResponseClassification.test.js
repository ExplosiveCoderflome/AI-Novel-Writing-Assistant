require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const { emptyResponseEvidence } = require("../dist/platform/llm/diagnostics/structuredEvidence.js");

const schema = z.object({ value: z.string() });
const profile = resolveStructuredOutputProfile({
  provider: "deepseek",
  model: "deepseek-chat",
  baseURL: "https://api.deepseek.com/v1",
  executionMode: "structured",
});

function input() {
  return {
    provider: "deepseek",
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com/v1",
    requestProtocol: "openai_compatible",
    structuredStrategy: "prompt_json",
    label: "structured.invoke.response-classification",
    taskType: "planner",
    schema,
    systemPrompt: "只返回 JSON。",
    userPrompt: "返回 value。",
    maxRepairAttempts: 0,
    disableFallbackModel: true,
  };
}

test("structured invocation distinguishes empty, reasoning exhaustion, truncation and network errors", async (t) => {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const originalFallback = structuredFallbackSettings.getStructuredFallbackSettings;
  let scenario;
  let calls = 0;
  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    provider,
    providerName: provider,
    model: options.model ?? "deepseek-chat",
    temperature: options.temperature ?? 0.3,
    apiKey: "test-key",
    baseURL: options.baseURL,
    maxTokens: options.maxTokens,
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    reasoningEnabled: false,
    reasoningForcedOff: true,
    modelKwargs: undefined,
    includeRawResponse: false,
    executionMode: options.executionMode ?? "plain",
    structuredProfile: options.executionMode === "structured" ? profile : null,
    structuredStrategy: options.structuredStrategy ?? null,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
  });
  factory.createLLMFromResolvedOptions = () => ({
    stream: async function* () {
      calls += 1;
      if (scenario.error) throw scenario.error;
      for (const chunk of scenario.chunks) yield chunk;
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: false,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: null,
    retryCount: 3,
  });
  t.after(() => {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    structuredFallbackSettings.getStructuredFallbackSettings = originalFallback;
  });

  const scenarios = [
    {
      name: "empty response",
      chunks: [],
      category: "empty_response",
      reason: "empty_response",
      message: /模型返回了空内容/,
    },
    {
      name: "reasoning exhausted",
      chunks: [{
        content: "",
        additional_kwargs: { reasoning_content: "仍在思考" },
        response_metadata: { finish_reason: "length" },
      }],
      category: "reasoning_budget_exhausted",
      reason: "reasoning_budget_exhausted",
      message: /只返回了思考内容.*关闭深度思考或提高输出 Token 上限/,
    },
    {
      name: "content truncated",
      chunks: [{ content: "{\"value\":\"unfinished", response_metadata: { finish_reason: "length" } }],
      category: "output_budget_exhausted",
      reason: "output_budget_exhausted",
      message: /被截断.*提高输出 Token 上限/,
    },
    {
      name: "network failure",
      error: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
      chunks: [],
      category: "transport_error",
      reason: "network",
      message: /网络错误.*渠道地址/,
    },
  ];

  for (const current of scenarios) {
    scenario = current;
    calls = 0;
    await assert.rejects(
      () => structuredInvoke.invokeStructuredLlmDetailed(input()),
      (error) => {
        assert.equal(error.category, current.category, current.name);
        assert.equal(error.diagnostics.response.failureReason, current.reason, current.name);
        assert.match(error.message, current.message, current.name);
        return true;
      },
    );
    assert.equal(
      calls,
      current.category === "transport_error" ? 2 : 1,
      current.category === "transport_error"
        ? "network errors keep the existing single transport retry"
        : `${current.name} must not enter generic transport retries`,
    );
  }
});

test("raw parser uses response evidence for reasoning-only and truncated outputs", async () => {
  const base = input();
  delete base.systemPrompt;
  delete base.userPrompt;
  delete base.structuredStrategy;
  delete base.disableFallbackModel;
  const reasoningEvidence = {
    ...emptyResponseEvidence(128),
    finishReason: "length",
    reasoningChars: 64,
  };
  await assert.rejects(
    () => structuredInvoke.parseStructuredLlmRawContentDetailed({
      ...base,
      rawContent: "",
      responseEvidence: reasoningEvidence,
      strategy: "prompt_json",
      profile,
    }),
    (error) => error.category === "reasoning_budget_exhausted"
      && error.diagnostics.response === reasoningEvidence,
  );

  const truncatedEvidence = {
    ...emptyResponseEvidence(128),
    finishReason: "max_tokens",
    contentChars: 19,
  };
  await assert.rejects(
    () => structuredInvoke.parseStructuredLlmRawContentDetailed({
      ...base,
      rawContent: "{\"value\":\"unfinished",
      responseEvidence: truncatedEvidence,
      strategy: "prompt_json",
      profile,
    }),
    (error) => error.category === "output_budget_exhausted"
      && error.diagnostics.response === truncatedEvidence,
  );
});
