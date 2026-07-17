const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveFixedRecommendedVolumeCount,
  resolveBeatSheetTargetChapterCount,
} = require("../dist/services/novel/volume/volumeGenerationOrchestrator.js");
const {
  allocateChapterBudgets,
} = require("../dist/services/novel/volume/volumeGenerationHelpers.js");

function createVolume(id, chapterCount) {
  return {
    id,
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      id: `${id}-chapter-${index + 1}`,
    })),
  };
}

test("chapter budgets ignore incomplete prefix-only generated chapters", () => {
  const budgets = allocateChapterBudgets({
    volumeCount: 8,
    chapterBudget: 430,
    existingVolumes: [
      createVolume("volume-1", 53),
      createVolume("volume-2", 0),
      createVolume("volume-3", 0),
      createVolume("volume-4", 0),
      createVolume("volume-5", 0),
      createVolume("volume-6", 0),
      createVolume("volume-7", 0),
      createVolume("volume-8", 0),
    ],
  });

  assert.equal(budgets.reduce((sum, count) => sum + count, 0), 430);
  assert.ok(budgets[1] >= 40, `expected second volume budget to stay usable, got ${budgets[1]}`);
  assert.ok(budgets[1] <= 60, `expected second volume budget near an even split, got ${budgets[1]}`);
});

test("volume strategy fixed count respects explicit user count before existing draft count", () => {
  assert.equal(resolveFixedRecommendedVolumeCount({
    userPreferredVolumeCount: 6,
    respectedExistingVolumeCount: 3,
  }), 6);
});

test("volume strategy fixed count locks respected existing draft count", () => {
  assert.equal(resolveFixedRecommendedVolumeCount({
    userPreferredVolumeCount: null,
    respectedExistingVolumeCount: 2,
  }), 2);
});

test("volume strategy fixed count stays open without user or existing draft count", () => {
  assert.equal(resolveFixedRecommendedVolumeCount({
    userPreferredVolumeCount: null,
    respectedExistingVolumeCount: null,
  }), null);
});

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
