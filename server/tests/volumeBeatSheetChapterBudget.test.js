const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBeatSheetChapterSpanUpperBound,
  inferRequiredChapterCountFromBeatSheet,
  resolveTargetChapterCount,
} = require("../dist/services/novel/volume/volumeBeatSheetChapterBudget.js");

test("getBeatSheetChapterSpanUpperBound returns the upper bound for chapter ranges", () => {
  assert.equal(getBeatSheetChapterSpanUpperBound("20-25章"), 25);
  assert.equal(getBeatSheetChapterSpanUpperBound("第29-30章"), 30);
  assert.equal(getBeatSheetChapterSpanUpperBound("第8章"), 8);
  assert.equal(getBeatSheetChapterSpanUpperBound("未标注"), 0);
});

test("resolveTargetChapterCount accepts small beat-sheet drift above the budget", () => {
  const resolved = resolveTargetChapterCount({
    budgetedChapterCount: 40,
    beatSheetRequiredChapterCount: 46,
  });

  assert.equal(resolved.targetChapterCount, 46);
  assert.equal(resolved.beatSheetCountAccepted, true);
  assert.equal(resolved.maxTrustedChapterCount, 50);
});

test("resolveTargetChapterCount ignores implausible beat-sheet chapter counts", () => {
  const resolved = resolveTargetChapterCount({
    budgetedChapterCount: 62,
    beatSheetRequiredChapterCount: 250,
  });

  assert.equal(resolved.targetChapterCount, 62);
  assert.equal(resolved.beatSheetCountAccepted, false);
  assert.equal(resolved.maxTrustedChapterCount, 78);
});

test("resolveTargetChapterCount rejects beat sheets that shrink below the planned budget", () => {
  const resolved = resolveTargetChapterCount({
    budgetedChapterCount: 54,
    beatSheetRequiredChapterCount: 7,
  });

  assert.equal(resolved.targetChapterCount, 54);
  assert.equal(resolved.beatSheetCountAccepted, false);
});
