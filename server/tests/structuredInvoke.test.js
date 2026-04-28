const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const { buildStructuredResponseFormat, resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const { plannerOutputSchema } = require("../dist/services/planner/plannerSchemas.js");
const { normalizePlannerOutput } = require("../dist/services/planner/PlannerService.js");

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

test("parseStructuredLlmRawContentDetailed unwraps singleton array wrappers for object schemas before repair", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify([{ value: "wrapped" }]),
    schema: z.object({
      value: z.string(),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.singleton.unwrap",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });

  assert.deepEqual(result.data, { value: "wrapped" });
  assert.equal(result.repairUsed, false);
  assert.equal(result.repairAttempts, 0);
});

test("parseStructuredLlmRawContentDetailed preserves planner goal aliases after singleton unwrap", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify([{
      title: "第 3 章",
      goal: "接到鬼宅委托并决定前往现场",
      participants: ["林渊", "委托人"],
      reveals: ["城南旧宅出现异常阴气"],
      riskNotes: ["不要把委托写成背景复述"],
      hookTarget: "章末留下进宅前的危险预感",
      planRole: "progress",
      phaseLabel: "委托启动",
      mustAdvance: ["确认鬼宅地址"],
      mustPreserve: ["主角仍在摸索事务所运营"],
      scenes: [{
        title: "陌生来电",
        sceneGoal: "让委托人说出鬼宅地址",
        conflict: "电话断续且信息不完整",
        reveal: "旧宅里出现无法解释的脚步声",
        emotionBeat: "疑虑升高",
      }],
    }]),
    schema: plannerOutputSchema,
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.planner.alias.unwrap",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });
  const normalized = normalizePlannerOutput(result.data);

  assert.equal(normalized.objective, "接到鬼宅委托并决定前往现场");
  assert.equal(normalized.scenes[0].objective, "让委托人说出鬼宅地址");
  assert.equal(result.repairUsed, false);
});

test("parseStructuredLlmRawContentDetailed accepts markdown fenced JSON without invoking repair", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: "```json\n{\"value\":\"fenced\"}\n```",
    schema: z.object({
      value: z.string(),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.fenced.json",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });

  assert.deepEqual(result.data, { value: "fenced" });
  assert.equal(result.repairUsed, false);
  assert.equal(result.repairAttempts, 0);
});

test("parseStructuredLlmRawContentDetailed preserves singleton arrays when schema expects a top-level array", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify([{ value: "wrapped" }]),
    schema: z.array(z.object({
      value: z.string(),
    })).length(1),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.singleton.array",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });

  assert.deepEqual(result.data, [{ value: "wrapped" }]);
  assert.equal(result.repairUsed, false);
  assert.equal(result.repairAttempts, 0);
});

test("parseStructuredLlmRawContentDetailed does not collapse multi-item arrays for object schemas", async () => {
  await assert.rejects(async () => structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify([{ value: "first" }, { value: "second" }]),
    schema: z.object({
      value: z.string(),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.multi-item.array",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  }), /STRUCTURED_OUTPUT:schema_mismatch/i);
});

test("parseStructuredLlmRawContentDetailed surfaces schema mismatch for missing required fields", async () => {
  await assert.rejects(async () => structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify({ value: "present" }),
    schema: z.object({
      value: z.string(),
      requiredField: z.string(),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.missing.field",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  }), /STRUCTURED_OUTPUT:schema_mismatch/i);
});

test("parseStructuredLlmRawContentDetailed reports schema mismatch when AI repair still misses required fields", async () => {
  const originalGetLLM = factory.getLLM;

  factory.getLLM = async () => ({
    invoke: async () => ({
      content: "{\"value\":\"fixed\"}",
    }),
  });

  try {
    await assert.rejects(async () => structuredInvoke.parseStructuredLlmRawContentDetailed({
      rawContent: "not valid json",
      schema: z.object({
        value: z.string(),
        requiredField: z.string(),
      }),
      provider: "deepseek",
      model: "deepseek-chat",
      label: "structured.invoke.repair.schema-mismatch",
      maxRepairAttempts: 1,
      strategy: "prompt_json",
      profile: resolveStructuredOutputProfile({
        provider: "deepseek",
        model: "deepseek-chat",
        executionMode: "structured",
      }),
    }), /STRUCTURED_OUTPUT:schema_mismatch/i);
  } finally {
    factory.getLLM = originalGetLLM;
  }
});

test("summarizeStructuredOutputFailure tells users to retry or switch models for incomplete JSON", () => {
  const summary = structuredInvoke.summarizeStructuredOutputFailure({
    error: new Error("Unexpected end of JSON input"),
    fallbackAvailable: true,
  });

  assert.equal(summary.category, "incomplete_json");
  assert.equal(summary.failureCode, "STRUCTURED_OUTPUT_INCOMPLETE_JSON");
  assert.match(summary.summary, /截断|不完整/);
  assert.match(summary.summary, /重试/);
  assert.match(summary.summary, /更强模型|备用模型/);
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

test("invokeStructuredLlmDetailed preserves routed structured format for explicit routed provider and model", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalGetFallbackSettings = structuredFallbackSettings.getStructuredFallbackSettings;
  const calls = [];

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    const resolvedProvider = provider ?? "openai";
    const resolvedModel = options.model ?? "MiniMax-M2.5";
    const baseURL = options.baseURL ?? "https://api.openai.com/v1";
    const structuredProfile = options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        baseURL,
        executionMode: "structured",
      })
      : null;
    const inheritedRouteStrategy = options.taskType === "planner"
      && resolvedProvider === "openai"
      && resolvedModel === "MiniMax-M2.5"
      ? "json_object"
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-key",
      baseURL,
      maxTokens: options.maxTokens,
      requestProtocol: "openai_compatible",
      reasoningEnabled: !(structuredProfile?.requiresNonThinkingForStructured),
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      structuredProfile,
      structuredStrategy: options.structuredStrategy ?? inheritedRouteStrategy,
      reasoningForcedOff: Boolean(structuredProfile?.requiresNonThinkingForStructured),
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  factory.createLLMFromResolvedOptions = (resolved) => ({
    invoke: async () => {
      calls.push({
        provider: resolved.provider,
        model: resolved.model,
        strategy: resolved.structuredStrategy,
      });
      return {
        content: "{\"value\":\"route-json-object\"}",
      };
    },
  });
  structuredFallbackSettings.getStructuredFallbackSettings = async () => ({
    enabled: false,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: null,
  });

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "MiniMax-M2.5",
      label: "structured.invoke.explicit.routed-format",
      taskType: "planner",
      schema: z.object({
        value: z.string(),
      }),
      systemPrompt: "只返回 JSON。",
      userPrompt: "给我一个 value。",
      disableFallbackModel: true,
    });

    assert.deepEqual(result.data, { value: "route-json-object" });
    assert.deepEqual(calls, [
      { provider: "openai", model: "MiniMax-M2.5", strategy: "json_object" },
    ]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originalGetFallbackSettings;
  }
});

test("invokeStructuredLlmDetailed switches to the configured fallback model after primary transport failure", async () => {
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
      { provider: "deepseek", strategy: "json_object" },
    ]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    structuredFallbackSettings.getStructuredFallbackSettings = originalGetFallbackSettings;
  }
});

test("invokeStructuredLlmDetailed preserves explicit Anthropic protocol through repair calls", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalGetLLM = factory.getLLM;
  const resolveCalls = [];
  let repairRequestProtocol = null;

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    resolveCalls.push({
      provider,
      requestProtocol: options.requestProtocol,
      structuredStrategy: options.structuredStrategy,
      executionMode: options.executionMode,
    });
    const resolvedProvider = provider ?? "openai";
    const resolvedModel = options.model ?? "claude-sonnet-4-5";
    const requestProtocol = options.requestProtocol === "anthropic" ? "anthropic" : "openai_compatible";
    const structuredProfile = options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: resolvedProvider,
        model: resolvedModel,
        requestProtocol,
        executionMode: "structured",
      })
      : null;
    return {
      provider: resolvedProvider,
      providerName: resolvedProvider,
      model: resolvedModel,
      temperature: options.temperature ?? 0.3,
      apiKey: "test-key",
      baseURL: options.baseURL ?? "https://api.anthropic.com",
      maxTokens: options.maxTokens,
      requestProtocol,
      reasoningEnabled: true,
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      structuredProfile,
      structuredStrategy: options.structuredStrategy ?? null,
      reasoningForcedOff: false,
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => ({
      content: "not-json",
    }),
  });
  factory.getLLM = async (_provider, options = {}) => {
    repairRequestProtocol = options.requestProtocol ?? null;
    return {
      invoke: async () => ({
        content: "{\"value\":\"fixed\"}",
      }),
    };
  };

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      provider: "openai",
      model: "claude-sonnet-4-5",
      requestProtocol: "anthropic",
      label: "structured.invoke.anthropic.repair",
      taskType: "planner",
      schema: z.object({
        value: z.string(),
      }),
      systemPrompt: "只返回 JSON。",
      userPrompt: "给我一个 value。",
      disableFallbackModel: true,
    });

    assert.deepEqual(result.data, { value: "fixed" });
    assert.equal(resolveCalls[0].requestProtocol, "anthropic");
    assert.equal(resolveCalls[1].requestProtocol, "anthropic");
    assert.deepEqual(resolveCalls.map((call) => call.structuredStrategy), [undefined, "prompt_json"]);
    assert.equal(repairRequestProtocol, "anthropic");
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    factory.getLLM = originalGetLLM;
  }
});

test("parseStructuredLlmRawContentDetailed ignores generated string length limits while preserving trim normalization", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify({
      summary: "  short  ",
      hook: "toolongvalue",
      code: "  abcd  ",
    }),
    schema: z.object({
      summary: z.string().trim().min(10),
      hook: z.string().max(5),
      code: z.string().trim().length(3),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.length.relaxed",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });

  assert.deepEqual(result.data, {
    summary: "short",
    hook: "toolongvalue",
    code: "abcd",
  });
  assert.equal(result.repairUsed, false);
  assert.equal(result.repairAttempts, 0);
});

test("parseStructuredLlmRawContentDetailed trims oversized arrays to exact schema length without invoking repair", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify({
      chapters: [
        { title: "a" },
        { title: "b" },
        { title: "c" },
      ],
    }),
    schema: z.object({
      chapters: z.array(z.object({
        title: z.string(),
      })).length(2),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.array.trim",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  });

  assert.deepEqual(result.data, {
    chapters: [
      { title: "a" },
      { title: "b" },
    ],
  });
  assert.equal(result.repairUsed, false);
  assert.equal(result.repairAttempts, 0);
});

test("parseStructuredLlmRawContentDetailed does not invent missing array items when output is undersized", async () => {
  await assert.rejects(() => structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify({
      chapters: [
        { title: "a" },
      ],
    }),
    schema: z.object({
      chapters: z.array(z.object({
        title: z.string(),
      })).length(2),
    }),
    provider: "deepseek",
    model: "deepseek-chat",
    label: "structured.invoke.array.undersized",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "deepseek",
      model: "deepseek-chat",
      executionMode: "structured",
    }),
  }), /STRUCTURED_OUTPUT:schema_mismatch/i);
});

test("buildStructuredResponseFormat keeps string length limits in json schema sent to the model", () => {
  const responseFormat = buildStructuredResponseFormat({
    strategy: "json_schema",
    schema: z.object({
      summary: z.string().trim().min(10).max(50),
      items: z.array(z.object({
        code: z.string().length(3),
      })).max(4),
    }),
    label: "structured.invoke.length.schema",
  });

  const serializedSchema = JSON.stringify(responseFormat?.json_schema?.schema ?? {});

  assert.equal(serializedSchema.includes("minLength"), true);
  assert.equal(serializedSchema.includes("maxLength"), true);
  assert.equal(serializedSchema.includes("maxItems"), true);
});
