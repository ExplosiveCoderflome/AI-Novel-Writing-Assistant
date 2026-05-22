import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNovelCoverDraftContext,
  buildNovelCoverDraftSourcePrompt,
} from "./novelCoverDraft.ts";

const baseBasicForm = {
  title: "雾港审判局",
  description: "黑雾侵城后，主角被迫成为审判者。",
  targetAudience: "喜欢都市悬疑和高压追更感的读者",
  bookSellingPoint: "审判升级与迷雾悬案并行",
  competingFeel: "冷峻、压迫、强悬念",
  first30ChapterPromise: "前 30 章先破第一案，再掀开黑雾交易链",
  commercialTagsText: "强冲突，都市奇诡，强冲突，持续追更",
  genreId: "genre-urban",
  primaryStoryModeId: "mode-judge",
  secondaryStoryModeId: "mode-case",
  worldId: "world-fog",
  status: "draft",
  writingMode: "original",
  projectMode: "co_pilot",
  narrativePov: "third_person",
  pacePreference: "fast",
  styleTone: "冷峻克制",
  emotionIntensity: "high",
  aiFreedom: "medium",
  postGenerationStyleReviewEnabled: true,
  defaultChapterLength: 2800,
  estimatedChapterCount: 80,
  projectStatus: "not_started",
  storylineStatus: "not_started",
  outlineStatus: "not_started",
  resourceReadyScore: 20,
  continuationSourceType: "novel",
  sourceNovelId: "",
  sourceKnowledgeDocumentId: "",
  continuationBookAnalysisId: "",
  continuationBookAnalysisSections: [],
};

test("novel cover draft context reuses basic info and world slice labels", () => {
  const context = buildNovelCoverDraftContext({
    basicForm: baseBasicForm,
    genreOptions: [{ id: "genre-urban", label: "都市异能", path: "都市 / 都市异能" }],
    storyModeOptions: [
      { id: "mode-judge", name: "审判升级流", label: "审判升级流", path: "爽文 / 审判升级流" },
      { id: "mode-case", name: "悬案追凶流", label: "悬案追凶流", path: "悬疑 / 悬案追凶流" },
    ],
    worldOptions: [{ id: "world-fog", name: "雾港" }],
    worldSliceView: {
      hasWorld: true,
      worldId: "world-fog",
      worldName: "雾港",
      slice: {
        coreWorldFrame: "高压雾港里，审判机构与地下交易同时运作。",
      },
      overrides: {},
      availableRules: [],
      availableForces: [],
      availableLocations: [],
      storyInputSource: "story_macro",
      isStale: false,
    },
  });

  assert.equal(context.title, "雾港审判局");
  assert.deepEqual(context.commercialTags, ["强冲突", "都市奇诡", "持续追更"]);
  assert.equal(context.genreLabel, "都市 / 都市异能");
  assert.equal(context.primaryStoryModeLabel, "爽文 / 审判升级流");
  assert.equal(context.secondaryStoryModeLabel, "悬疑 / 悬案追凶流");
  assert.equal(context.worldSummary, "高压雾港里，审判机构与地下交易同时运作。");
  assert.equal(context.narrativePovLabel, "第三人称");
  assert.equal(context.pacePreferenceLabel, "快节奏");
  assert.equal(context.emotionIntensityLabel, "高情绪浓度");
});

test("novel cover draft source prompt includes beginner-facing cover cues", () => {
  const prompt = buildNovelCoverDraftSourcePrompt({
    basicForm: baseBasicForm,
    genreOptions: [{ id: "genre-urban", label: "都市异能", path: "都市 / 都市异能" }],
    storyModeOptions: [
      { id: "mode-judge", name: "审判升级流", label: "审判升级流", path: "爽文 / 审判升级流" },
      { id: "mode-case", name: "悬案追凶流", label: "悬案追凶流", path: "悬疑 / 悬案追凶流" },
    ],
    worldOptions: [{ id: "world-fog", name: "雾港" }],
    worldSliceView: {
      hasWorld: true,
      worldId: "world-fog",
      worldName: "雾港",
      slice: {
        coreWorldFrame: "高压雾港里，审判机构与地下交易同时运作。",
      },
      overrides: {},
      availableRules: [],
      availableForces: [],
      availableLocations: [],
      storyInputSource: "story_macro",
      isStale: false,
    },
  });

  assert.match(prompt, /雾港审判局 的小说封面主画面/);
  assert.match(prompt, /目标读者：喜欢都市悬疑和高压追更感的读者/);
  assert.match(prompt, /商业标签：强冲突、都市奇诡、持续追更/);
  assert.match(prompt, /世界氛围：高压雾港里，审判机构与地下交易同时运作。/);
  assert.match(prompt, /封面目标：突出这本书最抓人的视觉卖点，生成不带文字的封面主画面。/);
});
