const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildForwardVolumeBeatImpactItems,
  buildVolumeImpactResult,
} = require("../dist/services/novel/volume/volumePlanChangeDetection.js");

function createChapter(input) {
  return {
    id: input.id,
    volumeId: "volume-1",
    chapterOrder: input.chapterOrder,
    beatKey: input.beatKey,
    title: input.title,
    summary: input.summary,
    purpose: null,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createVolume(overrides = {}) {
  return {
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
    chapters: [
      createChapter({ id: "chapter-plan-1", chapterOrder: 1, beatKey: "open_hook", title: "第一章", summary: "第一章摘要" }),
      createChapter({ id: "chapter-plan-2", chapterOrder: 2, beatKey: "open_hook", title: "第二章", summary: "第二章摘要" }),
      createChapter({ id: "chapter-plan-3", chapterOrder: 3, beatKey: "midpoint_turn", title: "第三章", summary: "第三章摘要" }),
      createChapter({ id: "chapter-plan-4", chapterOrder: 4, beatKey: "midpoint_turn", title: "第四章", summary: "第四章摘要" }),
    ],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createBeatSheets() {
  return [
    {
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [
        {
          key: "open_hook",
          label: "开卷抓手",
          title: "夜市夺印",
          summary: "建立开局危机。",
          chapterSpanHint: "1-2章",
          mustDeliver: ["压迫感"],
        },
        {
          key: "midpoint_turn",
          label: "中段转向",
          title: "旧盟破裂",
          summary: "关系和目标转向。",
          chapterSpanHint: "3-4章",
          mustDeliver: ["转向"],
        },
        {
          key: "final_hook",
          label: "卷末钩子",
          title: "暗门开启",
          summary: "留下下一段牵引。",
          chapterSpanHint: "5-6章",
          mustDeliver: ["尾钩"],
        },
      ],
    },
  ];
}

test("volume impact projection locks beats with draft content and limits stale work to unwritten beats", () => {
  const beforeVolume = createVolume();
  const afterVolume = createVolume({
    mainPromise: "主承诺调整后需要后续角色接入",
  });

  const result = buildVolumeImpactResult(
    "novel-1",
    [beforeVolume],
    [afterVolume],
    null,
    {
      beatSheets: createBeatSheets(),
      existingChapters: [
        { id: "chapter-1", order: 1, title: "第一章", content: "已有正文" },
        { id: "chapter-2", order: 2, title: "第二章", content: "" },
        { id: "chapter-3", order: 3, title: "第三章", content: "" },
        { id: "chapter-4", order: 4, title: "第四章", content: "" },
      ],
    },
  );

  assert.deepEqual(
    result.affectedBeats.map((beat) => [beat.beatKey, beat.status, beat.reason]),
    [
      ["open_hook", "locked_with_draft", "locked_with_draft"],
      ["midpoint_turn", "stale", "generated_without_draft"],
      ["final_hook", "pending", "ungenerated"],
    ],
  );
  assert.equal(result.staleBeatCount, 2);
  assert.equal(result.lockedBeatCount, 1);
  assert.equal(result.defaultImpactAction, "接入后续未写段");
});

test("forward beat impact for character injection skips already passed beats", () => {
  const affectedBeats = buildForwardVolumeBeatImpactItems({
    volumes: [createVolume()],
    beatSheets: createBeatSheets(),
    existingChapters: [
      { id: "chapter-1", order: 1, title: "第一章", content: "已有正文" },
      { id: "chapter-2", order: 2, title: "第二章", content: "已有正文" },
      { id: "chapter-3", order: 3, title: "第三章", content: "" },
      { id: "chapter-4", order: 4, title: "第四章", content: "" },
    ],
    fromChapterOrder: 3,
  });

  assert.deepEqual(
    affectedBeats.map((beat) => [beat.beatKey, beat.status]),
    [
      ["midpoint_turn", "stale"],
      ["final_hook", "pending"],
    ],
  );
});
