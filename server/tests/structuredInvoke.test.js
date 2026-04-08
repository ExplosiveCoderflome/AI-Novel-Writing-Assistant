const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");

test("parseStructuredLlmRawContentDetailed recovers when repair output is truncated but completable", async () => {
  const originalGetLLM = factory.getLLM;

  factory.getLLM = async () => ({
    invoke: async () => ({
      content: "{\"value\":\"fixed\"",
    }),
  });

  try {
    const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
      rawContent: "这不是合法 JSON。",
      schema: z.object({
        value: z.string(),
      }),
      provider: "deepseek",
      model: "deepseek-chat",
      label: "structured.invoke.test",
      maxRepairAttempts: 1,
    });

    assert.deepEqual(result.data, { value: "fixed" });
    assert.equal(result.repairUsed, true);
    assert.equal(result.repairAttempts, 1);
  } finally {
    factory.getLLM = originalGetLLM;
  }
});

test("invokeStructuredLlmDetailed degrades to prompt JSON before using fallback models", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalGetFallbackSettings = structuredFallbackSettings.getStructuredFallbackSettings;
  const calls = [];

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? "openai";
    const resolvedModel = options.model ?? (resolvedProvider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");
    const baseURL = options.baseURL ?? (resolvedProvider === "deepseek"
      ? "https://api.deepseek.com/v1"
      : "https://api.openai.com/v1");
    const structuredProfile = options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        baseURL,
        executionMode: "structured",
      })
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-key",
      baseURL,
      maxTokens: options.maxTokens,
      reasoningEnabled: !(structuredProfile?.requiresNonThinkingForStructured),
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      structuredProfile,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningForcedOff: Boolean(structuredProfile?.requiresNonThinkingForStructured),
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  factory.createLLMFromResolvedOptions = (resolved) => ({
    invoke: async () => {
      calls.push({
        provider: resolved.provider,
        strategy: resolved.structuredStrategy,
      });
      if (resolved.provider === "openai" && resolved.structuredStrategy !== "prompt_json") {
        throw new Error("response_format is not supported");
      }
      return {
        content: "{\"value\":\"primary-prompt-json\"}",
      };
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: true,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: null,
  });

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "gpt-4o-mini",
      label: "structured.invoke.compat.primary",
      taskType: "planner",
      schema: z.object({
        value: z.string(),
      }),
      systemPrompt: "只返回 JSON。",
      userPrompt: "给我一个 value。",
      disableFallbackModel: false,
    });

    assert.deepEqual(result.data, { value: "primary-prompt-json" });
    assert.equal(result.diagnostics.fallbackUsed, false);
    assert.deepEqual(calls, [
      { provider: "openai", strategy: "json_schema" },
      { provider: "openai", strategy: "json_object" },
      { provider: "openai", strategy: "prompt_json" },
    ]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originalGetFallbackSettings;
  }
});

test("invokeStructuredLlmDetailed switches to the configured fallback model after primary strategies fail", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalGetFallbackSettings = structuredFallbackSettings.getStructuredFallbackSettings;
  const calls = [];

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? "openai";
    const resolvedModel = options.model ?? (resolvedProvider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");
    const baseURL = options.baseURL ?? (resolvedProvider === "deepseek"
      ? "https://api.deepseek.com/v1"
      : "https://api.openai.com/v1");
    const structuredProfile = options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        baseURL,
        executionMode: "structured",
      })
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-key",
      baseURL,
      maxTokens: options.maxTokens,
      reasoningEnabled: !(structuredProfile?.requiresNonThinkingForStructured),
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      structuredProfile,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningForcedOff: Boolean(structuredProfile?.requiresNonThinkingForStructured),
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  factory.createLLMFromResolvedOptions = (resolved) => ({
    invoke: async () => {
      calls.push({
        provider: resolved.provider,
        strategy: resolved.structuredStrategy,
      });
      if (resolved.provider === "openai") {
        throw new Error("primary structured output failed");
      }
      return {
        content: "{\"value\":\"fallback-ok\"}",
      };
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: true,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: null,
  });

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "gpt-4o-mini",
      label: "structured.invoke.compat.fallback",
      taskType: "planner",
      schema: z.object({
        value: z.string(),
      }),
      systemPrompt: "只返回 JSON。",
      userPrompt: "给我一个 value。",
      disableFallbackModel: false,
    });

    assert.deepEqual(result.data, { value: "fallback-ok" });
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.deepEqual(calls, [
      { provider: "openai", strategy: "json_schema" },
      { provider: "openai", strategy: "json_object" },
      { provider: "openai", strategy: "prompt_json" },
      { provider: "deepseek", strategy: "json_object" },
    ]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originalGetFallbackSettings;
  }
});
