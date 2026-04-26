const test = require("node:test");
const assert = require("node:assert/strict");

const {
  volumeBeatSheetPrompt,
} = require("../dist/prompting/prompts/novel/volume/beatSheet.prompts.js");

function createPromptInput(targetChapterCount) {
  return {
    novel: {
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      estimatedChapterCount: 430,
      narrativePov: null,
      pacePreference: null,
      emotionIntensity: null,
      storyModePromptBlock: null,
      genre: null,
      characters: [],
    },
    workspace: {
      novelId: "novel-1",
      workspaceVersion: "v2",
      volumes: [],
      strategyPlan: null,
      critiqueReport: null,
      beatSheets: [],
      rebalanceDecisions: [],
      readiness: {},
      source: "volume",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: {
      id: "volume-2",
      novelId: "novel-1",
      sortOrder: 2,
      title: "第二卷",
      summary: "第二卷摘要",
      openingHook: "开卷抓手",
      mainPromise: "主承诺",
      primaryPressureSource: "压力源",
      coreSellingPoint: "核心卖点",
      escalationMode: "升级方式",
      protagonistChange: "主角变化",
      midVolumeRisk: "中段风险",
      climax: "高潮",
      payoffType: "兑现",
      nextVolumeHook: "下卷钩子",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    targetChapterCount,
    guidance: undefined,
  };
}

test("volumeBeatSheetPrompt postValidate rejects target 54 output that only covers 7 chapters", () => {
  assert.throws(
    () => volumeBeatSheetPrompt.postValidate({
      beats: [
        { key: "b1", label: "开局", summary: "开局", chapterSpanHint: "1章", mustDeliver: ["开局"] },
        { key: "b2", label: "推进", summary: "推进", chapterSpanHint: "2章", mustDeliver: ["推进"] },
        { key: "b3", label: "转向", summary: "转向", chapterSpanHint: "3-4章", mustDeliver: ["转向"] },
        { key: "b4", label: "挤压", summary: "挤压", chapterSpanHint: "5章", mustDeliver: ["挤压"] },
        { key: "b5", label: "高潮", summary: "高潮", chapterSpanHint: "6章", mustDeliver: ["高潮"] },
        { key: "b6", label: "尾钩", summary: "尾钩", chapterSpanHint: "7章", mustDeliver: ["尾钩"] },
      ],
    }, createPromptInput(54), { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 }),
    /54/,
  );
});

test("volumeBeatSheetPrompt postValidate accepts output that covers target 54", () => {
  const output = {
    beats: [
      { key: "b1", label: "开局", summary: "开局", chapterSpanHint: "1-8章", mustDeliver: ["开局"] },
      { key: "b2", label: "推进", summary: "推进", chapterSpanHint: "9-18章", mustDeliver: ["推进"] },
      { key: "b3", label: "转向", summary: "转向", chapterSpanHint: "19-30章", mustDeliver: ["转向"] },
      { key: "b4", label: "挤压", summary: "挤压", chapterSpanHint: "31-42章", mustDeliver: ["挤压"] },
      { key: "b5", label: "高潮", summary: "高潮", chapterSpanHint: "43-50章", mustDeliver: ["高潮"] },
      { key: "b6", label: "尾钩", summary: "尾钩", chapterSpanHint: "51-54章", mustDeliver: ["尾钩"] },
    ],
  };

  assert.deepEqual(
    volumeBeatSheetPrompt.postValidate(
      output,
      createPromptInput(54),
      { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 },
    ),
    output,
  );
});
