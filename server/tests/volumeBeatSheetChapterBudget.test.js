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

test("inferRequiredChapterCountFromBeatSheet uses the farthest beat span end", () => {
  const beatSheet = {
    beats: [
      { chapterSpanHint: "1-2章" },
      { chapterSpanHint: "5-7章" },
      { chapterSpanHint: "12-15章" },
      { chapterSpanHint: "20-25章" },
      { chapterSpanHint: "29-30章" },
    ],
  };

  assert.equal(inferRequiredChapterCountFromBeatSheet(beatSheet), 30);
  assert.equal(inferRequiredChapterCountFromBeatSheet({ beats: [] }), 0);
  assert.equal(inferRequiredChapterCountFromBeatSheet(null), 0);
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
