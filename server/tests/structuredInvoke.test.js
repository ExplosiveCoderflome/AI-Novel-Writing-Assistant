const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      aPIKey: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      llmModelRoute: {
        findMany: async () => [],
      },
      appSetting: {
        findMany: async () => [],
      },
    },
  },
};

const factory = require("../dist/llm/factory.js");
const structuredFallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
const { buildStructuredResponseFormat, resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const { directorCandidateResponseSchema } = require("../dist/services/novel/director/novelDirectorSchemas.js");
const { plannerOutputSchema } = require("../dist/services/planner/plannerSchemas.js");
const { normalizePlannerOutput } = require("../dist/services/planner/PlannerService.js");

function buildRepairResolvedOptions(provider, options = {}) {
  return {
    provider: provider ?? "openai",
    providerName: provider ?? "openai",
    model: options.model ?? "gpt-5.4",
    temperature: options.temperature ?? 0.15,
    apiKey: options.apiKey ?? "test-key",
    baseURL: options.baseURL ?? "https://example.invalid/v1",
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    reasoningEnabled: false,
    requestHeaders: {},
    modelKwargs: undefined,
    includeRawResponse: false,
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    executionMode: options.executionMode ?? "plain",
    structuredProfile: options.executionMode === "structured"
      ? resolveStructuredOutputProfile({
        provider: provider ?? "openai",
        model: options.model ?? "gpt-5.4",
        baseURL: options.baseURL ?? "https://example.invalid/v1",
        executionMode: "structured",
        requestProtocol: options.requestProtocol ?? "openai_compatible",
      })
      : null,
    structuredStrategy: options.structuredStrategy ?? null,
    reasoningForcedOff: false,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
    modelRoute: options.taskType ?? undefined,
    routeDegraded: false,
  };
}

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

test("parseStructuredLlmRawContentDetailed wraps bare top-level arrays into single-array-field object schemas before repair", async () => {
  const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
    rawContent: JSON.stringify([
      {
        workingTitle: "规则快递员",
        logline: "底层跑腿员误入隐形规则网络，为了活命只能边学边反压制定规则的人。",
        positioning: "都市规则反杀成长文",
        sellingPoint: "都市高压规则系统下的底层反压升级",
        coreConflict: "主角越想脱身，越必须利用追杀自己的规则。",
        protagonistPath: "从只会保命的跑腿员变成敢于反制规则制定者的人。",
        endingDirection: "代价沉重但撕开更高层黑幕。",
        hookStrategy: "每次跑单都撞上一条更凶的规则和更高位的敌人。",
        progressionLoop: "发现规则，试图借力破局，引来更强反噬，再逼出更深真相。",
        whyItFits: "兼顾都市压迫、规则钩子和持续升级。",
        toneKeywords: ["都市", "规则"],
        targetChapterCount: 30,
      },
      {
        workingTitle: "夜单禁区",
        logline: "夜班配送员被迫进入只在凌晨开启的禁区线路，每完成一次配送都得替更高层承担代价。",
        positioning: "都市禁区规则悬压文",
        sellingPoint: "每单都像闯关，每次通关都把主角推向更危险的上层视野。",
        coreConflict: "主角必须在保命接单和借单逆袭之间做越来越危险的选择。",
        protagonistPath: "从被线路驱赶的夜班工具人，成长为能反向操盘禁区线路的人。",
        endingDirection: "拿到向上撕开的资格，但也正式踏入更黑的规则核心。",
        hookStrategy: "每条禁区夜单都先给主角一个回报，再立刻加码更大的追杀。",
        progressionLoop: "接到异常夜单，完成代价任务，吃到短期回报，引来更大压迫，逼出更深规则。",
        whyItFits: "保留都市高压和持续升级，同时加强连载型任务驱动。",
        toneKeywords: ["都市", "禁区"],
        targetChapterCount: 32,
      },
    ]),
    schema: directorCandidateResponseSchema,
    provider: "openai",
    model: "gpt-5.4",
    label: "structured.invoke.director.bare-array",
    maxRepairAttempts: 0,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: "openai",
      model: "gpt-5.4",
      executionMode: "structured",
      requestProtocol: "openai_compatible",
    }),
  });

  assert.equal(result.repairUsed, false);
  assert.equal(result.data.candidates.length, 2);
  assert.equal(result.data.candidates[0].workingTitle, "规则快递员");
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

test("parseStructuredLlmRawContentDetailed wraps bare array repair output into single-array-field object schemas", async () => {
  const originalGetLLM = factory.getLLM;

  factory.getLLM = async () => ({
    invoke: async () => ({
      content: JSON.stringify([
        {
          workingTitle: "规则快递员",
          logline: "底层跑腿员误入隐形规则网络，为了活命只能边学边反压制定规则的人。",
          positioning: "都市规则反杀成长文",
          sellingPoint: "都市高压规则系统下的底层反压升级",
          coreConflict: "主角越想脱身，越必须利用追杀自己的规则。",
          protagonistPath: "从只会保命的跑腿员变成敢于反制规则制定者的人。",
          endingDirection: "代价沉重但撕开更高层黑幕。",
          hookStrategy: "每次跑单都撞上一条更凶的规则和更高位的敌人。",
          progressionLoop: "发现规则，试图借力破局，引来更强反噬，再逼出更深真相。",
          whyItFits: "兼顾都市压迫、规则钩子和持续升级。",
          toneKeywords: ["都市", "规则"],
          targetChapterCount: 30,
        },
        {
          workingTitle: "夜单禁区",
          logline: "夜班配送员被迫进入只在凌晨开启的禁区线路，每完成一次配送都得替更高层承担代价。",
          positioning: "都市禁区规则悬压文",
          sellingPoint: "每单都像闯关，每次通关都把主角推向更危险的上层视野。",
          coreConflict: "主角必须在保命接单和借单逆袭之间做越来越危险的选择。",
          protagonistPath: "从被线路驱赶的夜班工具人，成长为能反向操盘禁区线路的人。",
          endingDirection: "拿到向上撕开的资格，但也正式踏入更黑的规则核心。",
          hookStrategy: "每条禁区夜单都先给主角一个回报，再立刻加码更大的追杀。",
          progressionLoop: "接到异常夜单，完成代价任务，吃到短期回报，引来更大压迫，逼出更深规则。",
          whyItFits: "保留都市高压和持续升级，同时加强连载型任务驱动。",
          toneKeywords: ["都市", "禁区"],
          targetChapterCount: 32,
        },
      ]),
    }),
  });

  try {
    const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
      rawContent: JSON.stringify({
        result: "invalid wrapper",
      }),
      schema: directorCandidateResponseSchema,
      provider: "openai",
      model: "gpt-5.4",
      label: "structured.invoke.director.repair-bare-array",
      maxRepairAttempts: 1,
      strategy: "prompt_json",
      profile: resolveStructuredOutputProfile({
        provider: "openai",
        model: "gpt-5.4",
        executionMode: "structured",
        requestProtocol: "openai_compatible",
      }),
    });

    assert.equal(result.repairUsed, true);
    assert.equal(result.repairAttempts, 1);
    assert.equal(result.data.candidates.length, 2);
    assert.equal(result.data.candidates[1].workingTitle, "夜单禁区");
  } finally {
    factory.getLLM = originalGetLLM;
  }
});

test("parseStructuredLlmRawContentDetailed falls back to direct chat repair when SDK repair invoke hits transport_error", async () => {
  const originalGetLLM = factory.getLLM;
  const originalResolveLLMClientOptions = factory.resolveLLMClientOptions;
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  factory.getLLM = async () => ({
    invoke: async () => {
      throw new Error("Cannot read properties of undefined (reading 'entries')");
    },
  });
  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider, options);
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              value: "fixed",
              requiredField: "present",
            }),
          },
        }],
      }),
    };
  };

  try {
    const result = await structuredInvoke.parseStructuredLlmRawContentDetailed({
      rawContent: JSON.stringify({
        value: "present",
      }),
      schema: z.object({
        value: z.string(),
        requiredField: z.string(),
      }),
      provider: "openai",
      model: "gpt-5.4",
      apiKey: "test-key",
      baseURL: "https://example.invalid/v1",
      taskType: "planner",
      requestProtocol: "openai_compatible",
      label: "structured.invoke.repair.transport-fallback",
      maxRepairAttempts: 1,
      strategy: "prompt_json",
      profile: resolveStructuredOutputProfile({
        provider: "openai",
        model: "gpt-5.4",
        baseURL: "https://example.invalid/v1",
        executionMode: "structured",
        requestProtocol: "openai_compatible",
      }),
    });

    assert.equal(fetchCalls, 1);
    assert.deepEqual(result.data, {
      value: "fixed",
      requiredField: "present",
    });
    assert.equal(result.repairUsed, true);
    assert.equal(result.repairAttempts, 1);
  } finally {
    factory.getLLM = originalGetLLM;
    factory.resolveLLMClientOptions = originalResolveLLMClientOptions;
    global.fetch = originalFetch;
  }
});

test("parseStructuredLlmRawContentDetailed keeps repair transport details when repair fallback also fails", async () => {
  const originalGetLLM = factory.getLLM;
  const originalResolveLLMClientOptions = factory.resolveLLMClientOptions;
  const originalFetch = global.fetch;

  factory.getLLM = async () => ({
    invoke: async () => {
      throw new Error("Cannot read properties of undefined (reading 'entries')");
    },
  });
  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider, options);
  global.fetch = async () => ({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
    text: async () => "repair fallback exploded",
  });

  try {
    await assert.rejects(async () => structuredInvoke.parseStructuredLlmRawContentDetailed({
      rawContent: JSON.stringify({
        value: "present",
      }),
      schema: z.object({
        value: z.string(),
        requiredField: z.string(),
      }),
      provider: "openai",
      model: "gpt-5.4",
      apiKey: "test-key",
      baseURL: "https://example.invalid/v1",
      taskType: "planner",
      requestProtocol: "openai_compatible",
      label: "structured.invoke.repair.transport-fallback-fails",
      maxRepairAttempts: 1,
      strategy: "prompt_json",
      profile: resolveStructuredOutputProfile({
        provider: "openai",
        model: "gpt-5.4",
        baseURL: "https://example.invalid/v1",
        executionMode: "structured",
        requestProtocol: "openai_compatible",
      }),
    }), (error) => {
      assert.match(error.message, /STRUCTURED_OUTPUT:schema_mismatch/i);
      assert.match(error.message, /reading 'entries'|repair fallback exploded/i);
      assert.doesNotMatch(error.message, /reading 'message'/i);
      return true;
    });
  } finally {
    factory.getLLM = originalGetLLM;
    factory.resolveLLMClientOptions = originalResolveLLMClientOptions;
    global.fetch = originalFetch;
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

test("invokeStructuredLlmDetailed applies resolved structured timeout for openai-compatible prompt_json attempts", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let observedAbortReason = null;
  const pendingInvocations = new Set();
  let fallbackFetchCount = 0;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? null,
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
    timeoutMs: options.executionMode === "structured" ? 50 : options.timeoutMs,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async (_messages, options = {}) => {
      const invocation = new Promise((_resolve, reject) => {
        const signal = options.signal;
        const timeoutHandle = setTimeout(() => {
          pendingInvocations.delete(invocation);
          reject(new Error("structured invoke did not respect resolved timeout"));
        }, 300);
        signal?.addEventListener("abort", () => {
          clearTimeout(timeoutHandle);
          observedAbortReason = signal.reason;
          pendingInvocations.delete(invocation);
          reject(signal.reason);
        }, { once: true });
      });
      pendingInvocations.add(invocation);
      return invocation;
    },
  });

  global.fetch = async (_url, options = {}) => {
    fallbackFetchCount += 1;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        reject(options.signal.reason);
      }, { once: true });
    });
  };

  try {
    await assert.rejects(
      () => structuredInvoke.invokeStructuredLlmDetailed({
        schema: z.object({ value: z.string() }),
        provider: "openai",
        model: "gpt-5.4",
        taskType: "planner",
        structuredStrategy: "prompt_json",
        requestProtocol: "openai_compatible",
        label: "structured.invoke.timeout.boundary",
        messages: [{ type: "human", content: "只输出 JSON" }],
        disableFallbackModel: true,
      }),
      /transport_error|timed out/i,
    );
    assert.match(String(observedAbortReason?.message ?? observedAbortReason ?? ""), /timed out after 50ms/i);
    assert.equal(fallbackFetchCount, 0);
  } finally {
    await Promise.allSettled(Array.from(pendingInvocations));
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});

test("invokeStructuredLlmDetailed falls back to direct openai-compatible transport after prompt_json transport_error", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let invokeCount = 0;
  let fetchCount = 0;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? "prompt_json",
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => {
      invokeCount += 1;
      throw new Error("fetch failed");
    },
  });

  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ value: "direct-fallback-ok" }),
          },
        }],
      }),
      text: async () => "",
    };
  };

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "openai",
      model: "gpt-5.4",
      taskType: "planner",
      structuredStrategy: "prompt_json",
      requestProtocol: "openai_compatible",
      label: "structured.invoke.transport.fallback",
      messages: [{ type: "human", content: "只输出 JSON" }],
      disableFallbackModel: true,
    });

    assert.equal(invokeCount, 1);
    assert.equal(fetchCount, 1);
    assert.deepEqual(result.data, { value: "direct-fallback-ok" });
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});

test("invokeStructuredLlmDetailed does not use direct openai-compatible fallback for anthropic protocol", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let fetchCount = 0;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "anthropic", {
    model: options.model ?? "claude-sonnet-4-5",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? "prompt_json",
    requestProtocol: "anthropic",
    taskType: options.taskType,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => {
      throw new Error("fetch failed");
    },
  });

  global.fetch = async () => {
    fetchCount += 1;
    throw new Error("should not call direct openai fallback");
  };

  try {
    await assert.rejects(
      () => structuredInvoke.invokeStructuredLlmDetailed({
        schema: z.object({ value: z.string() }),
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        taskType: "planner",
        structuredStrategy: "prompt_json",
        requestProtocol: "anthropic",
        label: "structured.invoke.transport.no-openai-fallback",
        messages: [{ type: "human", content: "只输出 JSON" }],
        disableFallbackModel: true,
      }),
      /transport_error|fetch failed/i,
    );
    assert.equal(fetchCount, 0);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});

test("invokeStructuredLlmDetailed does not invoke direct fallback after a governed timeout transport_error", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let directFallbackHit = false;
  const pendingInvocations = new Set();

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? "prompt_json",
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
    timeoutMs: options.executionMode === "structured" ? 50 : options.timeoutMs,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async (_messages, options = {}) => {
      const invocation = new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          pendingInvocations.delete(invocation);
          reject(options.signal.reason);
        }, { once: true });
      });
      pendingInvocations.add(invocation);
      return invocation;
    },
  });

  global.fetch = async (_url, options = {}) => {
    directFallbackHit = true;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        reject(options.signal.reason);
      }, { once: true });
    });
  };

  try {
    await assert.rejects(
      () => structuredInvoke.invokeStructuredLlmDetailed({
        schema: z.object({ value: z.string() }),
        provider: "openai",
        model: "gpt-5.4",
        taskType: "planner",
        structuredStrategy: "prompt_json",
        requestProtocol: "openai_compatible",
        label: "structured.invoke.timeout.no-direct-fallback",
        messages: [{ type: "human", content: "只输出 JSON" }],
        disableFallbackModel: true,
      }),
      /transport_error|timed out/i,
    );
    assert.equal(directFallbackHit, false);
  } finally {
    await Promise.allSettled(Array.from(pendingInvocations));
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});

test("invokeStructuredLlmDetailed preserves object message content in direct openai-compatible fallback payloads", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let capturedBody = null;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? "prompt_json",
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => {
      throw new Error("fetch failed");
    },
  });

  global.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ value: "direct-fallback-ok" }),
          },
        }],
      }),
      text: async () => "",
    };
  };

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "openai",
      model: "gpt-5.4",
      taskType: "planner",
      structuredStrategy: "prompt_json",
      requestProtocol: "openai_compatible",
      label: "structured.invoke.transport.object-message",
      messages: [{ type: "human", content: { text: "对象文本", extra: 1 } }],
      disableFallbackModel: true,
    });

    assert.deepEqual(result.data, { value: "direct-fallback-ok" });
    assert.equal(capturedBody.messages.length, 1);
    assert.match(capturedBody.messages[0].content, /对象文本/);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});

test("invokeStructuredLlmDetailed degrades openai-compatible json_schema transport_error into prompt_json direct fallback", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  const calls = [];
  let fetchCount = 0;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildRepairResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? null,
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
  });

  factory.createLLMFromResolvedOptions = (resolved) => ({
    invoke: async () => {
      calls.push({ provider: resolved.provider, strategy: resolved.structuredStrategy });
      throw new Error("fetch failed");
    },
  });

  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ value: "json-schema-direct-fallback-ok" }),
          },
        }],
      }),
      text: async () => "",
    };
  };

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "openai",
      model: "gpt-5.4",
      taskType: "planner",
      label: "structured.invoke.json-schema.transport-fallback",
      messages: [{ type: "human", content: "只输出 JSON" }],
      disableFallbackModel: true,
    });

    assert.deepEqual(result.data, { value: "json-schema-direct-fallback-ok" });
    assert.equal(fetchCount, 1);
    assert.deepEqual(calls, [
      { provider: "openai", strategy: "json_schema" },
      { provider: "openai", strategy: "json_object" },
      { provider: "openai", strategy: "prompt_json" },
    ]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
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
