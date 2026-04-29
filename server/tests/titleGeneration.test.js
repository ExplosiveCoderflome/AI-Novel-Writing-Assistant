const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectUniqueSuggestions,
  detectTitleSurfaceFrame,
  hasEnoughStructuralVariety,
} = require("../dist/services/title/titleGeneration.shared.js");
const {
  titleGenerationPrompt,
} = require("../dist/prompting/prompts/helper/titleGeneration.prompt.js");
const factory = require("../dist/llm/factory.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const {
  TitleGenerationService,
} = require("../dist/services/title/TitleGenerationService.js");

test("collectUniqueSuggestions maps legacy title fields into the current schema", () => {
  const titles = collectUniqueSuggestions([
    {
      title: "丧尸围城，我的超市无限刷新",
      score: 88,
      hookType: "power_mutation",
      coreSell: "超市刷新",
      reason: "优势明确，资源兑现非常直接",
    },
  ], 1);

  assert.equal(titles.length, 1);
  assert.equal(titles[0].clickRate, 88);
  assert.equal(titles[0].style, "high_concept");
  assert.equal(titles[0].angle, "超市刷新");
  assert.equal(titles[0].reason, "优势明确，资源兑现非常直接");
});

test("detectTitleSurfaceFrame distinguishes common title skeletons", () => {
  assert.equal(detectTitleSurfaceFrame("别人躲丧尸，我开局驯服尸王"), "contrast_then_self");
  assert.equal(detectTitleSurfaceFrame("在丧尸世界，我有一座安全屋"), "setting_then_self");
  assert.equal(detectTitleSurfaceFrame("全球感染，我觉醒了物资标记"), "scenario_then_self");
  assert.equal(detectTitleSurfaceFrame("末日规则：击杀丧尸掉落物资"), "colon_split");
  assert.equal(detectTitleSurfaceFrame("当丧尸学会了敲门"), "when_open");
});

test("collectUniqueSuggestions limits overused title skeletons within a batch", () => {
  const rawTitles = [
    { title: "全球感染，我觉醒了物资标记", clickRate: 90, style: "high_concept", angle: "物资标记" },
    { title: "丧尸爆发，我继承了军火仓库", clickRate: 89, style: "conflict", angle: "军火仓库" },
    { title: "末日降临，我的农场开始爆仓", clickRate: 88, style: "high_concept", angle: "农场爆仓" },
    { title: "灾变当天，我提前锁死了避难所", clickRate: 87, style: "suspense", angle: "锁死避难所" },
    { title: "在丧尸世界，我有一座安全屋", clickRate: 86, style: "high_concept", angle: "安全屋" },
    { title: "末日规则：击杀丧尸掉落物资", clickRate: 85, style: "suspense", angle: "击杀掉落" },
    { title: "当尸潮学会绕后偷袭", clickRate: 84, style: "suspense", angle: "尸潮绕后" },
    { title: "我的避难所，能升级成末世堡垒", clickRate: 83, style: "high_concept", angle: "避难所升级" },
  ];

  const titles = collectUniqueSuggestions(rawTitles, 6);
  const scenarioThenSelfCount = titles.filter((item) => detectTitleSurfaceFrame(item.title) === "scenario_then_self").length;

  assert.equal(titles.length, 6);
  assert.ok(scenarioThenSelfCount <= 3);
});

test("hasEnoughStructuralVariety rejects batches that reuse one frame too heavily", () => {
  const narrowBatch = [
    { title: "全球感染，我觉醒了物资标记", clickRate: 88, style: "high_concept" },
    { title: "丧尸爆发，我继承了军火仓库", clickRate: 87, style: "conflict" },
    { title: "末日降临，我的农场开始爆仓", clickRate: 86, style: "high_concept" },
    { title: "灾变当天，我提前锁死了避难所", clickRate: 85, style: "suspense" },
    { title: "尸潮来袭，我用废品造出了机枪塔", clickRate: 84, style: "conflict" },
    { title: "世界停电，我的仓库突然开始复制", clickRate: 83, style: "high_concept" },
    { title: "末日倒计时：尸潮七天后抵达", clickRate: 82, style: "suspense" },
    { title: "当丧尸学会了敲门", clickRate: 81, style: "literary" },
  ];

  assert.equal(hasEnoughStructuralVariety(narrowBatch, 8), false);
});

test("title prompt render now asks for current output fields and structure diversity", () => {
  const messages = titleGenerationPrompt.render({
    context: {
      mode: "brief",
      count: 8,
      brief: "末世丧尸题材，主角拥有不断刷新的超市资源。",
      referenceTitle: "",
      novelTitle: "",
      currentTitle: "",
      genreName: "末世",
      genreDescription: "资源争夺和生存压力并存。",
    },
    forceJson: true,
    retryReason: "标题句式框架过于集中",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  const systemPrompt = String(messages[0].content);

  assert.match(systemPrompt, /clickRate/);
  assert.match(systemPrompt, /style/);
  assert.match(systemPrompt, /hookType/);
  assert.match(systemPrompt, /句式框架/);
  assert.match(systemPrompt, /标题句式框架过于集中/);
});

test("title generation follows model route when no explicit provider is selected", async () => {
  const originalResolveOptions = factory.resolveLLMClientOptions;
  const originalStructuredInvoker = promptRunner.setPromptRunnerStructuredInvokerForTests;
  const capturedResolveProviders = [];
  const capturedPromptProviders = [];

  factory.resolveLLMClientOptions = async (provider, options = {}) => {
    capturedResolveProviders.push(provider);
    return {
      provider: provider ?? "openai",
      providerName: provider ?? "openai",
      model: options.model ?? "route-title-model",
      temperature: options.temperature ?? 0.85,
      apiKey: "test-key",
      baseURL: "https://api.openai.com/v1",
      maxTokens: options.maxTokens,
      concurrencyLimit: 0,
      requestIntervalMs: 0,
      requestProtocol: "openai_compatible",
      reasoningEnabled: true,
      modelKwargs: undefined,
      includeRawResponse: false,
      executionMode: options.executionMode ?? "plain",
      structuredProfile: null,
      structuredStrategy: null,
      reasoningForcedOff: false,
      taskType: options.taskType,
      promptMeta: options.promptMeta,
    };
  };
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    capturedPromptProviders.push(input.provider);
    return {
      data: {
        titles: [
          { title: "灾变超市，每天刷新一座仓库", clickRate: 92, style: "high_concept", angle: "资源刷新", reason: "卖点直接" },
          { title: "别人抢水，我的货架自动补满", clickRate: 90, style: "contrast", angle: "补货反差", reason: "反差清楚" },
          { title: "末日规则：超市老板拥有无限库存", clickRate: 89, style: "suspense", angle: "规则库存", reason: "规则感强" },
          { title: "丧尸围城，我把便利店开成堡垒", clickRate: 88, style: "conflict", angle: "便利店堡垒", reason: "场景鲜明" },
          { title: "当全城断粮，我的收银台亮了", clickRate: 87, style: "literary", angle: "断粮收银台", reason: "画面有钩子" },
          { title: "在废土开店，我卖的是明天", clickRate: 86, style: "fantasy", angle: "废土开店", reason: "记忆点强" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    const service = new TitleGenerationService();
    const result = await service.generateTitleIdeas({
      mode: "brief",
      brief: "末世丧尸题材，主角拥有不断刷新的超市资源。",
      count: 6,
    });

    assert.equal(result.titles.length, 6);
    assert.deepEqual(capturedResolveProviders, [undefined]);
    assert.deepEqual(capturedPromptProviders, [undefined]);
  } finally {
    factory.resolveLLMClientOptions = originalResolveOptions;
    originalStructuredInvoker();
  }
});
