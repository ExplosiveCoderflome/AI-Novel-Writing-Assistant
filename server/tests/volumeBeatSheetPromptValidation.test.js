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

function createCoveringBeats(targetChapterCount) {
  const spans = [
    [1, Math.max(1, Math.floor(targetChapterCount * 0.15))],
    [0, Math.max(1, Math.floor(targetChapterCount * 0.3))],
    [0, Math.max(1, Math.floor(targetChapterCount * 0.5))],
    [0, Math.max(1, Math.floor(targetChapterCount * 0.7))],
    [0, Math.max(1, Math.floor(targetChapterCount * 0.88))],
    [0, targetChapterCount],
  ];
  for (let index = 1; index < spans.length; index += 1) {
    spans[index][0] = spans[index - 1][1] + 1;
    if (spans[index][0] > spans[index][1]) {
      spans[index][1] = spans[index][0];
    }
  }
  spans[spans.length - 1][1] = targetChapterCount;

  const slots = [
    ["open_hook", "开卷抓手", "夜市夺印"],
    ["first_escalation", "首次升级", "借刀反制"],
    ["midpoint_turn", "中段转向", "旧盟破裂"],
    ["pressure_lock", "高潮前挤压", "围城代价"],
    ["climax", "卷高潮", "夺回令牌"],
    ["end_hook", "卷尾钩子", "北境来信"],
  ];

  return slots.map(([key, label, title], index) => ({
    key,
    label,
    title,
    summary: `${label}推进`,
    chapterSpanHint: spans[index][0] === spans[index][1]
      ? `${spans[index][0]}章`
      : `${spans[index][0]}-${spans[index][1]}章`,
    mustDeliver: [`${label}兑现`],
  }));
}

test("volumeBeatSheetPrompt postValidate rejects target 54 output that only covers 7 chapters", () => {
  assert.throws(
    () => volumeBeatSheetPrompt.postValidate({
      beats: [
        { key: "open_hook", label: "开卷抓手", title: "开局", summary: "开局", chapterSpanHint: "1章", mustDeliver: ["开局"] },
        { key: "first_escalation", label: "首次升级", title: "升级", summary: "推进", chapterSpanHint: "2章", mustDeliver: ["推进"] },
        { key: "midpoint_turn", label: "中段转向", title: "转向", summary: "转向", chapterSpanHint: "3-4章", mustDeliver: ["转向"] },
        { key: "pressure_lock", label: "高潮前挤压", title: "挤压", summary: "挤压", chapterSpanHint: "5章", mustDeliver: ["挤压"] },
        { key: "climax", label: "卷高潮", title: "高潮", summary: "高潮", chapterSpanHint: "6章", mustDeliver: ["高潮"] },
        { key: "end_hook", label: "卷尾钩子", title: "尾钩", summary: "尾钩", chapterSpanHint: "7章", mustDeliver: ["尾钩"] },
      ],
    }, createPromptInput(54), { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 }),
    /54/,
  );
});

test("volumeBeatSheetPrompt postValidate accepts output that covers target 54", () => {
  const output = {
    beats: createCoveringBeats(54),
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
