const test = require("node:test");
const assert = require("node:assert/strict");

const {
  preparePromptExecution,
} = require("../dist/prompting/core/promptRunner.js");
const {
  createVolumeChapterListPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterList.prompts.js");

function createPromptInput(targetChapterCount = 4) {
  return {
    novel: {
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: "[]",
      estimatedChapterCount: targetChapterCount,
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
      readiness: {
        canGenerateStrategy: true,
        canGenerateSkeleton: true,
        canGenerateBeatSheet: true,
        canGenerateChapterList: true,
        blockingReasons: [],
      },
      source: "volume",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: {
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第一卷",
      summary: "卷摘要",
      openingHook: "开卷抓手",
      mainPromise: "主承诺",
      primaryPressureSource: "压力源",
      coreSellingPoint: "核心卖点",
      escalationMode: "升级方式",
      protagonistChange: "主角变化",
      midVolumeRisk: "中段风险",
      climax: "高潮",
      payoffType: "兑现类型",
      nextVolumeHook: "下卷钩子",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    targetBeatSheet: {
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [],
    },
    targetBeat: {
      key: "open_hook",
      label: "开卷抓手",
      summary: "先把世界危险和主角困境钉死。",
      chapterSpanHint: `1-${targetChapterCount}章`,
      mustDeliver: ["压迫感"],
    },
    targetBeatChapterCount: targetChapterCount,
    targetChapterStartOrder: 1,
    targetChapterEndOrder: targetChapterCount,
    nextAvailableChapterOrder: 1,
    previousBeatChapterSummary: null,
    preservedBeatChapterSummary: null,
  };
}

test("auto structured output hint preserves array fields in the example skeleton", () => {
  const prepared = preparePromptExecution({
    asset: createVolumeChapterListPrompt(4),
    promptInput: createPromptInput(4),
  });

  assert.equal(prepared.messages.length, 3);
  assert.match(String(prepared.messages[2].content), /"chapters": \[/);
});
