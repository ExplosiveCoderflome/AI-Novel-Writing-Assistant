const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveSkeletonTargetVolumeCount,
  resolveBeatSheetTargetChapterCount,
} = require("../dist/services/novel/volume/volumeGenerationOrchestrator.js");
const {
  allocateChapterBudgets,
} = require("../dist/services/novel/volume/volumeGenerationHelpers.js");
const {
  resolveStructuredOutlineRecoveryCursor,
} = require("../dist/services/novel/director/novelDirectorStructuredOutlineRecovery.js");

test("beat sheet target chapter count is not shrunk by partial seed chapters", () => {
  const targetChapterCount = resolveBeatSheetTargetChapterCount({
    targetVolumeChapterCount: 10,
    targetVolumeIndex: 0,
    volumeCount: 8,
    chapterBudget: 430,
    chapterBudgets: [54, 54, 54, 54, 54, 54, 53, 53],
  });

  assert.equal(targetChapterCount, 54);
});

test("chapter budget allocation ignores sparse seed chapters for a 430-chapter book", () => {
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: 8,
    chapterBudget: 430,
    existingVolumes: [
      { chapters: Array.from({ length: 4 }, (_, index) => ({ id: `seed-${index + 1}` })) },
      { chapters: [] },
      { chapters: [] },
      { chapters: [] },
      { chapters: [] },
      { chapters: [] },
      { chapters: [] },
      { chapters: [] },
    ],
  });

  assert.deepEqual(chapterBudgets, [54, 54, 54, 54, 54, 54, 53, 53]);
});

test("skeleton regeneration ignores stale 4-volume strategy for a 430-chapter book", () => {
  const targetVolumeCount = resolveSkeletonTargetVolumeCount({
    strategyRecommendedVolumeCount: 4,
    guidanceRecommendedVolumeCount: 8,
    allowedVolumeCountRange: { min: 7, max: 11 },
  });

  assert.equal(targetVolumeCount, 8);
});

test("beat sheet target chapter count still preserves a larger existing volume", () => {
  const targetChapterCount = resolveBeatSheetTargetChapterCount({
    targetVolumeChapterCount: 70,
    targetVolumeIndex: 0,
    volumeCount: 8,
    chapterBudget: 430,
    chapterBudgets: [54, 54, 54, 54, 54, 54, 53, 53],
  });

  assert.equal(targetChapterCount, 70);
});

test("structured outline recovery regenerates a 4-chapter full-volume beat sheet for a 430-chapter book", () => {
  const workspace = {
    novelId: "novel-1",
    volumes: [{
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第一卷",
      chapters: Array.from({ length: 4 }, (_, index) => ({
        id: `chapter-${index + 1}`,
        volumeId: "volume-1",
        chapterOrder: index + 1,
        beatKey: "opening",
        title: `第${index + 1}章`,
        summary: "摘要",
        purpose: null,
        conflictLevel: null,
        revealLevel: null,
        targetWordCount: null,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
      })),
    }],
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{
        key: "opening",
        label: "开卷",
        summary: "开卷事件",
        chapterSpanHint: "1-4章",
        mustDeliver: ["开局承诺"],
      }],
    }],
  };

  const cursor = resolveStructuredOutlineRecoveryCursor({
    workspace,
    plan: { mode: "volume", volumeOrder: 1 },
    estimatedChapterCount: 430,
  });

  assert.equal(cursor.step, "beat_sheet");
  assert.equal(cursor.volumeId, "volume-1");
});
