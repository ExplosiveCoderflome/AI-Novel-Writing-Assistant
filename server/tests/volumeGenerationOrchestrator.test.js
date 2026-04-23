const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveBeatSheetTargetChapterCount,
} = require("../dist/services/novel/volume/volumeGenerationOrchestrator.js");

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
