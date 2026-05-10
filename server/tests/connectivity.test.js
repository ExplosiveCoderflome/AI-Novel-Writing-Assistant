const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: { prisma: {} },
};

const factory = require("../dist/llm/factory.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const modelRouter = require("../dist/llm/modelRouter.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");

test("testConnection does not fall back to anthropic when requestProtocol explicitly selects openai_compatible", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalGetLLM = factory.getLLM;
  const originalInvokeStructured = structuredInvoke.invokeStructuredLlmDetailed;
  const plainProtocols = [];
  const structuredProtocols = [];

  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    provider: provider ?? "openai",
    providerName: provider ?? "openai",
    model: options.model ?? "test-model",
    temperature: options.temperature ?? 0.1,
    apiKey: "test-key",
    baseURL: options.baseURL ?? "https://example.com/v1",
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    reasoningEnabled: true,
    requestHeaders: {},
    modelKwargs: undefined,
    includeRawResponse: false,
    requestProtocol: options.requestProtocol === "anthropic" ? "anthropic" : "openai_compatible",
    executionMode: options.executionMode ?? "plain",
    structuredProfile: null,
    structuredStrategy: options.structuredStrategy ?? null,
    reasoningForcedOff: false,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
    modelRoute: undefined,
    routeDegraded: false,
  });

  factory.getLLM = async (_provider, options = {}) => ({
    invoke: async () => {
      plainProtocols.push(options.requestProtocol ?? null);
      throw new Error("plain failed via " + (options.requestProtocol ?? "unknown"));
    },
  });

  structuredInvoke.invokeStructuredLlmDetailed = async (options) => {
    structuredProtocols.push(options.requestProtocol ?? null);
    throw new Error("structured failed via " + (options.requestProtocol ?? "unknown"));
  };

  try {
    const result = await llmConnectivityService.testConnection({
      provider: "openai",
      model: "test-model",
      requestProtocol: "openai_compatible",
      probeMode: "both",
    });

    assert.equal(result.ok, false);
    assert.deepEqual(plainProtocols, ["openai_compatible"]);
    assert.deepEqual(structuredProtocols, ["openai_compatible", "openai_compatible", "openai_compatible"]);
    assert.equal(result.plain?.requestProtocol, "openai_compatible");
    assert.equal(result.structured?.requestProtocol, "openai_compatible");
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.getLLM = originalGetLLM;
    structuredInvoke.invokeStructuredLlmDetailed = originalInvokeStructured;
  }
});

test("testModelRoutes does not persist probe protocol overrides for explicit route protocols", async () => {
  const originalResolveModel = modelRouter.resolveModel;
  const originalUpsert = modelRouter.upsertModelRouteConfig;
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalGetLLM = factory.getLLM;
  const originalInvokeStructured = structuredInvoke.invokeStructuredLlmDetailed;
  const persisted = [];

  modelRouter.resolveModel = async () => ({
    provider: "openai",
    model: "test-model",
    temperature: 0.3,
    maxTokens: null,
    requestProtocol: "openai_compatible",
    structuredResponseFormat: "json_object",
    requestHeadersText: null,
    routeKey: "planner",
    routeDegraded: false,
  });

  modelRouter.upsertModelRouteConfig = async (...args) => {
    persisted.push(args);
  };

  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    provider: provider ?? "openai",
    providerName: provider ?? "openai",
    model: options.model ?? "test-model",
    temperature: options.temperature ?? 0.1,
    apiKey: "test-key",
    baseURL: options.baseURL ?? "https://example.com/v1",
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    reasoningEnabled: true,
    requestHeaders: {},
    modelKwargs: undefined,
    includeRawResponse: false,
    requestProtocol: options.requestProtocol === "anthropic" ? "anthropic" : "openai_compatible",
    executionMode: options.executionMode ?? "plain",
    structuredProfile: null,
    structuredStrategy: options.structuredStrategy ?? null,
    reasoningForcedOff: false,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
    modelRoute: undefined,
    routeDegraded: false,
  });

  factory.getLLM = async () => ({
    invoke: async () => ({ content: "ok" }),
  });

  structuredInvoke.invokeStructuredLlmDetailed = async () => ({
    data: { status: "ok" },
    repairUsed: false,
    repairAttempts: 0,
    diagnostics: {
      strategy: "json_object",
      reasoningForcedOff: false,
      fallbackAvailable: false,
      fallbackUsed: false,
      profile: {
        nativeJsonObject: true,
        nativeJsonSchema: false,
        family: "openai-compatible",
      },
    },
  });

  try {
    const result = await llmConnectivityService.testModelRoutes(["planner"]);

    assert.equal(result.statuses.length, 1);
    assert.equal(result.statuses[0].structured?.ok, true);
    assert.deepEqual(persisted, []);
  } finally {
    modelRouter.resolveModel = originalResolveModel;
    modelRouter.upsertModelRouteConfig = originalUpsert;
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.getLLM = originalGetLLM;
    structuredInvoke.invokeStructuredLlmDetailed = originalInvokeStructured;
  }
});
