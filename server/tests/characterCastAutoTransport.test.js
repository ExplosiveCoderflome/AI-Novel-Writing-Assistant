const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      novel: {
        findUnique: async () => ({
          id: "novel-character-cast-auto-transport",
          title: "规则跑单人",
          description: "都市跑腿员被卷入吞噬违约者的规则网络，只能借规则求生反击。",
          genre: { name: "都市规则悬压" },
          world: null,
          bible: null,
          storyMacroPlan: null,
          bookContract: null,
          primaryStoryMode: null,
          secondaryStoryMode: null,
          characters: [],
        }),
      },
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
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const {
  generateAutoCharacterCastDraft,
} = require("../dist/services/novel/characterPrep/characterCastGeneration.js");

function buildResolvedOptions(provider, options = {}) {
  return {
    provider: provider ?? "openai",
    providerName: provider ?? "openai",
    model: options.model ?? "gpt-5.4",
    temperature: options.temperature ?? 0.5,
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

test("generateAutoCharacterCastDraft is recovered by shared structured transport fallback on primary transport_error", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalCreateLLM = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;
  let invokeCount = 0;
  let fetchCount = 0;

  factory.resolveLLMClientOptions = async (provider, options = {}) => buildResolvedOptions(provider ?? "openai", {
    model: options.model ?? "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: options.executionMode ?? "plain",
    structuredStrategy: options.structuredStrategy ?? "prompt_json",
    requestProtocol: options.requestProtocol ?? "openai_compatible",
    taskType: options.taskType,
    timeoutMs: options.timeoutMs,
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
            content: JSON.stringify({
              option: {
                title: "地铁规则求生组",
                summary: "林简在规则都市里被迫拉起一组能活下去也能反压的核心阵容。",
                whyItWorks: "主角、引路人和施压源都足够具体，能直接承接长篇规则求生。",
                recommendedReason: "角色关系清楚，能直接进入后续章节规划。",
                members: [
                  {
                    name: "林简",
                    role: "夜班跑单员",
                    gender: "male",
                    castRole: "protagonist",
                    relationToProtagonist: "主角本人",
                    storyFunction: "在规则追杀中学会借规则反压更高位的人。",
                    shortDescription: "被规则网络盯上的都市底层跑单员。",
                    outerGoal: "先活下来并保住饭碗。",
                    innerNeed: "相信自己不是只能被规则碾过去的人。",
                    fear: "被规则系统当成一次性消耗品。",
                    wound: "长期处在随时会被替换的底层位置。",
                    misbelief: "只要埋头忍住就能躲过去。",
                    secret: "已经被某条高阶规则悄悄标记。",
                    moralLine: "不拿无辜人顶锅。",
                    firstImpression: "反应快、嘴硬、一直绷着。"
                  },
                  {
                    name: "周砚秋",
                    role: "旧城区线路调度人",
                    gender: "female",
                    castRole: "mentor",
                    relationToProtagonist: "半引路半考验的前辈",
                    storyFunction: "让主角看懂规则城市的生存门道和代价。",
                    shortDescription: "熟悉旧城区异常线路的调度人。",
                    outerGoal: "维持自己掌握的安全线路。",
                    innerNeed: "找到一个敢真正反打规则的人。",
                    fear: "自己多年维持的秩序彻底失控。",
                    wound: "曾经失去过被自己带过的人。",
                    misbelief: "只有先冷下来才能活久一点。",
                    secret: "她知道标记林简的那条规则源头。",
                    moralLine: "不把新人直接送去喂规则。",
                    firstImpression: "冷静、锋利、像一直在算账。"
                  },
                  {
                    name: "邵景衡",
                    role: "城北节点掌控者",
                    gender: "male",
                    castRole: "pressure_source",
                    relationToProtagonist: "不断抬高代价的上层压迫者",
                    storyFunction: "持续制造生存压力和升级门槛。",
                    shortDescription: "把城市规则当资源经营的上层节点掌控者。",
                    outerGoal: "把更多线路和人手纳入自己控制。",
                    innerNeed: "证明自己才配改写规则分配权。",
                    fear: "更高层发现他已经失控。",
                    wound: "早年曾被同样的系统反噬。",
                    misbelief: "只有更狠的人才配活在规则顶端。",
                    secret: "他也在躲一条更高阶的追命规则。",
                    moralLine: "没有。",
                    firstImpression: "压迫感强，像随时会加码。"
                  }
                ],
                relations: [
                  {
                    sourceName: "林简",
                    targetName: "周砚秋",
                    surfaceRelation: "求生带路人与被带路者",
                    hiddenTension: "周砚秋还没确认林简值不值得押注。",
                    conflictSource: "林简急着反打，周砚秋更重视稳住线路。",
                    secretAsymmetry: "周砚秋知道更多标记源头。",
                    dynamicLabel: "试探结盟",
                    nextTurnPoint: "周砚秋决定是否交出第一条反制规则。"
                  },
                  {
                    sourceName: "林简",
                    targetName: "邵景衡",
                    surfaceRelation: "底层跑单员与节点掌控者",
                    hiddenTension: "邵景衡想把林简逼成自己手里的试验品。",
                    conflictSource: "林简越想保命，越得踩进邵景衡布的规则局。",
                    secretAsymmetry: "邵景衡更早知道林简被高阶规则标记。",
                    dynamicLabel: "持续施压",
                    nextTurnPoint: "邵景衡第一次拿林简身边人试代价。"
                  }
                ]
              }
            }),
          },
        }],
      }),
      text: async () => "",
    };
  };

  try {
    const result = await generateAutoCharacterCastDraft("novel-character-cast-auto-transport", {
      provider: "openai",
      model: "gpt-5.4",
      storyInput: "都市跑单员林简被卷入吞噬违约者的规则网络，必须借规则求生反击。",
    });

    assert.ok(invokeCount >= 1);
    assert.ok(fetchCount >= 1);
    assert.equal(result.parsed.option.title, "地铁规则求生组");
    assert.equal(result.parsed.option.members[0].name, "林简");
    assert.equal(result.parsed.option.members[1].gender, "female");
    assert.equal(result.parsed.option.relations.length, 2);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    factory.createLLMFromResolvedOptions = originalCreateLLM;
    global.fetch = originalFetch;
  }
});
