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

test("chapter budget allocation ignores partially generated long-book volumes", () => {
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: 16,
    chapterBudget: 1024,
    existingVolumes: [
      { chapters: Array.from({ length: 64 }, (_, index) => ({ id: `volume-1-${index + 1}` })) },
      { chapters: Array.from({ length: 13 }, (_, index) => ({ id: `volume-2-${index + 1}` })) },
      { chapters: Array.from({ length: 12 }, (_, index) => ({ id: `volume-3-${index + 1}` })) },
      { chapters: Array.from({ length: 10 }, (_, index) => ({ id: `volume-4-${index + 1}` })) },
      { chapters: Array.from({ length: 10 }, (_, index) => ({ id: `volume-5-${index + 1}` })) },
      { chapters: Array.from({ length: 9 }, (_, index) => ({ id: `volume-6-${index + 1}` })) },
      { chapters: Array.from({ length: 8 }, (_, index) => ({ id: `volume-7-${index + 1}` })) },
      { chapters: Array.from({ length: 8 }, (_, index) => ({ id: `volume-8-${index + 1}` })) },
      { chapters: Array.from({ length: 6 }, (_, index) => ({ id: `volume-9-${index + 1}` })) },
      ...Array.from({ length: 7 }, () => ({ chapters: [] })),
    ],
  });

  assert.deepEqual(chapterBudgets, Array.from({ length: 16 }, () => 64));
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
