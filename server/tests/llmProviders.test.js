const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { PROVIDERS, SUPPORTED_PROVIDERS } = require("../dist/llm/providers.js");
const {
  getJsonCapability,
  getModelParameterCompatibility,
  resolveModelTemperature,
} = require("../dist/llm/capabilities.js");
const { resolveLLMClientOptions, setProviderSecretCache } = require("../dist/llm/factory.js");
const {
  classifyStructuredOutputFailure,
  resolveStructuredOutputProfile,
  selectStructuredOutputStrategy,
} = require("../dist/llm/structuredOutput.js");

test("supported providers include kimi, minimax, glm, qwen, gemini and ollama", () => {
  for (const provider of ["kimi", "minimax", "glm", "qwen", "gemini", "ollama"]) {
    assert.ok(SUPPORTED_PROVIDERS.includes(provider), `${provider} should be available`);
  }
});

test("new provider defaults are present in their model fallback lists", () => {
  for (const provider of ["kimi", "minimax", "glm", "qwen", "gemini", "ollama"]) {
    assert.ok(
      PROVIDERS[provider].models.includes(PROVIDERS[provider].defaultModel),
      `${provider} default model should exist in fallback models`,
    );
  }
});

test("kimi thinking models do not enable forced json mode", () => {
  const stableCapability = getJsonCapability("kimi", "moonshot-v1-32k");
  assert.equal(stableCapability.supportsJsonObject, true);

  const thinkingCapability = getJsonCapability("kimi", "kimi-k2-thinking-turbo");
  assert.equal(thinkingCapability.supportsJsonObject, false);
});

test("kimi k2 models force temperature 1 while moonshot models keep requested temperature", () => {
  assert.deepEqual(
    getModelParameterCompatibility("kimi", "kimi-k2-turbo-preview"),
    { fixedTemperature: 1 },
  );
  assert.equal(resolveModelTemperature("kimi", "kimi-k2-turbo-preview", 0.4), 1);
  assert.equal(resolveModelTemperature("kimi", "moonshot-v1-32k", 0.4), 0.4);
  assert.equal(resolveModelTemperature("deepseek", "deepseek-chat", undefined), 0.7);
});

test("ollama does not advertise forced json mode", () => {
  const capability = getJsonCapability("ollama", "llama3.2");
  assert.equal(capability.supportsJsonObject, false);
  assert.equal(capability.supportsJsonSchema, false);
});

test("minimax clamps temperature into supported range", () => {
  assert.deepEqual(
    getModelParameterCompatibility("minimax", "MiniMax-M2.7"),
    { minimumTemperature: 0.01, maximumTemperature: 1 },
  );
  assert.equal(resolveModelTemperature("minimax", "MiniMax-M2.7", 0), 0.01);
  assert.equal(resolveModelTemperature("minimax", "MiniMax-M2.7", 1.5), 1);
  assert.equal(resolveModelTemperature("minimax", "MiniMax-M2.7", 0.4), 0.4);
});

test("structured output profiles distinguish official, ModelScope Qwen and unknown custom endpoints", () => {
  const schema = z.object({ value: z.string() });

  const openaiProfile = resolveStructuredOutputProfile({
    provider: "openai",
    model: "gpt-5-mini",
    baseURL: "https://api.openai.com/v1",
    executionMode: "structured",
  });
  assert.equal(openaiProfile.family, "openai");
  assert.equal(openaiProfile.nativeJsonSchema, true);
  assert.equal(selectStructuredOutputStrategy(openaiProfile, schema), "json_schema");

  const kimiProfile = resolveStructuredOutputProfile({
    provider: "kimi",
    model: "kimi-k2.5",
    baseURL: "https://api.moonshot.cn/v1",
    executionMode: "structured",
  });
  assert.equal(kimiProfile.family, "kimi");
  assert.equal(kimiProfile.nativeJsonObject, true);
  assert.equal(selectStructuredOutputStrategy(kimiProfile, schema), "json_object");

  const kimiThinkingProfile = resolveStructuredOutputProfile({
    provider: "kimi",
    model: "kimi-k2-thinking-turbo",
    baseURL: "https://api.moonshot.cn/v1",
    executionMode: "structured",
  });
  assert.equal(kimiThinkingProfile.family, "kimi");
  assert.equal(kimiThinkingProfile.nativeJsonObject, false);
  assert.equal(selectStructuredOutputStrategy(kimiThinkingProfile, schema), "prompt_json");

  const modelscopeProfile = resolveStructuredOutputProfile({
    provider: "custom_modelscope",
    model: "Qwen/Qwen3.5-397B-A17B",
    baseURL: "https://api-inference.modelscope.cn/v1",
    executionMode: "structured",
  });
  assert.equal(modelscopeProfile.family, "modelscope_qwen");
  assert.equal(modelscopeProfile.requiresNonThinkingForStructured, true);
  assert.equal(modelscopeProfile.supportsReasoningToggle, true);
  assert.equal(selectStructuredOutputStrategy(modelscopeProfile, schema), "prompt_json");
  assert.deepEqual(
    getJsonCapability("custom_modelscope", "Qwen/Qwen3.5-397B-A17B", "https://api-inference.modelscope.cn/v1"),
    { supportsJsonSchema: false, supportsJsonObject: false },
  );

  const customProfile = resolveStructuredOutputProfile({
    provider: "custom_gateway",
    model: "gpt-4o-mini",
    baseURL: "https://llm.example.com/v1",
    executionMode: "structured",
  });
  assert.equal(customProfile.family, "custom_openai_compatible");
  assert.equal(customProfile.nativeJsonObject, false);
  assert.equal(customProfile.preferredStructuredStrategy, "prompt_json");
});

test("resolveLLMClientOptions applies structured reasoning and token guardrails", async () => {
  setProviderSecretCache("custom_modelscope", {
    key: "test-key",
    model: "Qwen/Qwen3.5-397B-A17B",
    baseURL: "https://api-inference.modelscope.cn/v1",
    displayName: "ModelScope Qwen",
    reasoningEnabled: true,
  });

  try {
    const modelscope = await resolveLLMClientOptions("custom_modelscope", {
      executionMode: "structured",
      structuredStrategy: "prompt_json",
      maxTokens: 20000,
    });
    assert.equal(modelscope.structuredProfile?.family, "modelscope_qwen");
    assert.equal(modelscope.reasoningEnabled, false);
    assert.equal(modelscope.reasoningForcedOff, true);
    assert.equal(modelscope.modelKwargs?.enable_thinking, false);
    assert.equal(modelscope.maxTokens, 8192);

    const qwen = await resolveLLMClientOptions("qwen", {
      apiKey: "test-key",
      model: "qwen3.5-397b-a17b",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      executionMode: "structured",
      structuredStrategy: "json_object",
      maxTokens: 20000,
    });
    assert.equal(qwen.structuredProfile?.family, "dashscope_qwen");
    assert.equal(qwen.reasoningEnabled, false);
    assert.equal(qwen.reasoningForcedOff, true);
    assert.equal(qwen.modelKwargs?.enable_thinking, false);
    assert.equal(qwen.maxTokens, undefined);
  } finally {
    setProviderSecretCache("custom_modelscope", null);
  }
});

test("structured failure classification separates native-json, thinking and schema problems", () => {
  assert.equal(
    classifyStructuredOutputFailure({ error: new Error("response_format json_schema is not supported") }),
    "unsupported_native_json",
  );
  assert.equal(
    classifyStructuredOutputFailure({ rawContent: "<think>draft</think>{\"value\":\"ok\"}" }),
    "thinking_pollution",
  );
  assert.equal(
    classifyStructuredOutputFailure({ error: new Error("Unexpected end of JSON input") }),
    "incomplete_json",
  );
  assert.equal(
    classifyStructuredOutputFailure({ error: new Error("Expected ',' or '}' after property value") }),
    "malformed_json",
  );
  assert.equal(
    classifyStructuredOutputFailure({ error: new Error("schema validation failed") }),
    "schema_mismatch",
  );
});
