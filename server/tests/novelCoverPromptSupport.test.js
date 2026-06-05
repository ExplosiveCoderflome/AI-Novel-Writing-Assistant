const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT } = require("@ai-novel/shared/imagePrompt");
const {
  DEFAULT_NOVEL_COVER_IMAGE_COUNT,
  DEFAULT_NOVEL_COVER_IMAGE_SIZE,
} = require("@ai-novel/shared/types/image");
const { prisma } = require("../dist/db/prisma.js");
const { ImageGenerationService } = require("../dist/services/image/ImageGenerationService.js");
const { WorldContextGateway } = require("../dist/services/novel/worldContext/WorldContextGateway.js");
const {
  toNovelCoverPromptContext,
} = require("../dist/services/image/novelCover/novelCoverPromptSupport.js");

function buildWorldSliceJson(coreWorldFrame) {
  return JSON.stringify({
    storyId: "novel-cover-1",
    worldId: "world-1",
    coreWorldFrame,
    appliedRules: [],
    activeForces: [],
    activeLocations: [],
    activeElements: [],
    conflictCandidates: [],
    pressureSources: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    recommendedEntryPoints: [],
    forbiddenCombinations: [],
    storyScopeBoundary: "只保留都市审判边界",
    metadata: {
      schemaVersion: 1,
      builtAt: "2026-05-22T10:00:00.000Z",
      sourceWorldUpdatedAt: "2026-05-22T10:00:00.000Z",
      storyInputDigest: "digest",
      builtFromStructuredData: true,
      builderMode: "manual_refresh",
    },
  });
}

test("toNovelCoverPromptContext normalizes missing fields and parses world summary", () => {
  const context = toNovelCoverPromptContext({
    id: "novel-cover-1",
    title: "雾港审判局",
    description: "  当黑雾侵城，主角被迫成为审判者。  ",
    targetAudience: " 喜欢强冲突都市奇诡的读者 ",
    bookSellingPoint: null,
    competingFeel: " 冷峻、压迫、持续追更 ",
    first30ChapterPromise: " 先审判第一案，再揭露更大交易链 ",
    commercialTagsJson: JSON.stringify(["强冲突", "强冲突", "都市奇诡"]),
    styleTone: " 克制冷峻 ",
    narrativePov: "third_person",
    pacePreference: "fast",
    emotionIntensity: "high",
    storyWorldSliceJson: buildWorldSliceJson("高压雾港里，审判机构与地下交易同时运作。"),
    genre: { name: "都市异能" },
    primaryStoryMode: { name: "审判升级流" },
    secondaryStoryMode: { name: "悬案追凶流" },
    world: { name: "雾港" },
  });

  assert.equal(context.title, "雾港审判局");
  assert.equal(context.description, "当黑雾侵城，主角被迫成为审判者。");
  assert.equal(context.bookSellingPoint, null);
  assert.deepEqual(context.commercialTags, ["强冲突", "都市奇诡"]);
  assert.equal(context.genreLabel, "都市异能");
  assert.equal(context.primaryStoryModeLabel, "审判升级流");
  assert.equal(context.secondaryStoryModeLabel, "悬案追凶流");
  assert.equal(context.worldSummary, "高压雾港里，审判机构与地下交易同时运作。");
  assert.equal(context.narrativePovLabel, "第三人称");
  assert.equal(context.pacePreferenceLabel, "快节奏");
  assert.equal(context.emotionIntensityLabel, "高情绪浓度");
});

test("toNovelCoverPromptContext prefers gateway world context for cover visuals", () => {
  const context = toNovelCoverPromptContext({
    id: "novel-cover-1",
    title: "雾港审判局",
    description: null,
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: null,
    styleTone: null,
    narrativePov: null,
    pacePreference: null,
    emotionIntensity: null,
    storyWorldSliceJson: buildWorldSliceJson("旧切片雾港。"),
    genre: null,
    primaryStoryMode: null,
    secondaryStoryMode: null,
    world: { name: "旧世界" },
  }, {
    summaryText: "本书世界雾港，黑雾与审判机构共同塑造城市视觉。",
    activeForces: [{ id: "force-judge", name: "审判局", roleInStory: "压迫秩序", pressure: "审查" }],
    activeLocations: [{ id: "loc-harbor", name: "黑雾港口", storyUse: "开篇案件" }],
  });

  assert.match(context.worldSummary, /本书世界雾港/);
  assert.match(context.worldSummary, /审判局/);
  assert.match(context.worldSummary, /黑雾港口/);
  assert.doesNotMatch(context.worldSummary, /旧切片雾港/);
});

test("createNovelCoverTask applies novel-cover defaults without coupling to novel tables", async () => {
  const service = new ImageGenerationService();
  service.enqueueTask = () => {};

  const originalNovelFindUnique = prisma.novel.findUnique;
  const originalTaskCreate = prisma.imageGenerationTask.create;
  const originalGetWorldContextBlock = WorldContextGateway.prototype.getWorldContextBlock;
  let createdTaskData = null;

  prisma.novel.findUnique = async () => ({
    id: "novel-cover-1",
    title: "雾港审判局",
    description: "当黑雾侵城，主角被迫成为审判者。",
    targetAudience: "都市悬疑爽文读者",
    bookSellingPoint: "审判升级感与都市迷雾并行",
    competingFeel: "冷峻压迫",
    first30ChapterPromise: "前 30 章先破案再揭露黑雾源头",
    commercialTagsJson: JSON.stringify(["强冲突", "都市奇诡"]),
    styleTone: "冷峻克制",
    narrativePov: "third_person",
    pacePreference: "fast",
    emotionIntensity: "high",
    storyWorldSliceJson: buildWorldSliceJson("高压雾港里，审判机构与地下交易同时运作。"),
    genre: { name: "都市异能" },
    primaryStoryMode: { name: "审判升级流" },
    secondaryStoryMode: { name: "悬案追凶流" },
    world: { name: "雾港" },
  });
  prisma.imageGenerationTask.create = async ({ data }) => {
    createdTaskData = data;
    return {
      id: "image-task-cover-1",
      sceneType: data.sceneType,
      baseCharacterId: data.baseCharacterId,
      novelId: data.novelId,
      provider: data.provider,
      model: data.model,
      prompt: data.prompt,
      negativePrompt: data.negativePrompt,
      stylePreset: data.stylePreset,
      size: data.size,
      imageCount: data.imageCount,
      seed: data.seed ?? null,
      status: data.status,
      progress: 0,
      retryCount: 0,
      maxRetries: data.maxRetries,
      heartbeatAt: data.heartbeatAt,
      currentStage: data.currentStage,
      currentItemKey: data.currentItemKey,
      currentItemLabel: data.currentItemLabel,
      cancelRequestedAt: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-05-22T10:00:00.000Z"),
      updatedAt: new Date("2026-05-22T10:00:00.000Z"),
    };
  };
  WorldContextGateway.prototype.getWorldContextBlock = async () => ({
    summaryText: "本书世界雾港，黑雾压迫城市，审判局与地下交易同时运作。",
    activeForces: [{ id: "force-judge", name: "审判局", roleInStory: "秩序压力", pressure: "公开审判" }],
    activeLocations: [{ id: "loc-harbor", name: "黑雾港口", storyUse: "案件入口" }],
  });

  try {
    const task = await service.createNovelCoverTask({
      sceneType: "novel_cover",
      novelId: "novel-cover-1",
      prompt: "突出雾港中的审判者主视觉",
      promptMode: "novel_cover_chain",
      negativePrompt: "过度拥挤",
      provider: "openai",
      model: "gpt-image-2",
    });

    assert.equal(task.sceneType, "novel_cover");
    assert.equal(task.novelId, "novel-cover-1");
    assert.equal(task.baseCharacterId, null);
    assert.equal(task.size, DEFAULT_NOVEL_COVER_IMAGE_SIZE);
    assert.equal(task.imageCount, DEFAULT_NOVEL_COVER_IMAGE_COUNT);
    assert.ok(task.prompt.includes("no title text"));
    assert.ok(task.prompt.includes("Project title: 雾港审判局"));
    assert.ok(task.prompt.includes("本书世界雾港"));
    assert.ok(task.negativePrompt.includes("过度拥挤"));
    assert.ok(task.negativePrompt.includes(DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT));
    assert.equal(createdTaskData.baseCharacterId, null);
    assert.equal(createdTaskData.novelId, "novel-cover-1");
    assert.equal(createdTaskData.size, DEFAULT_NOVEL_COVER_IMAGE_SIZE);
    assert.equal(createdTaskData.imageCount, DEFAULT_NOVEL_COVER_IMAGE_COUNT);
  } finally {
    prisma.novel.findUnique = originalNovelFindUnique;
    prisma.imageGenerationTask.create = originalTaskCreate;
    WorldContextGateway.prototype.getWorldContextBlock = originalGetWorldContextBlock;
  }
});
