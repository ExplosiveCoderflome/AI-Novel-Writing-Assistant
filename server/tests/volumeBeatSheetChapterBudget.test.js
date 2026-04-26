const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBeatSheetChapterSpanUpperBound,
  inferRequiredChapterCountFromBeatSheet,
  validateBeatSheetChapterCoverage,
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

test("validateBeatSheetChapterCoverage rejects beat sheets that end far below the target", () => {
  const beatSheet = {
    beats: [
      { chapterSpanHint: "1章" },
      { chapterSpanHint: "2章" },
      { chapterSpanHint: "3-4章" },
      { chapterSpanHint: "5章" },
      { chapterSpanHint: "6章" },
      { chapterSpanHint: "7章" },
    ],
  };

  const result = validateBeatSheetChapterCoverage({
    beatSheet,
    targetChapterCount: 54,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.requiredChapterCount, 7);
  assert.match(result.message, /54/);
  assert.match(result.message, /7/);
});

test("validateBeatSheetChapterCoverage accepts complete contiguous target coverage", () => {
  const beatSheet = {
    beats: [
      { chapterSpanHint: "1-8章" },
      { chapterSpanHint: "9-18章" },
      { chapterSpanHint: "19-30章" },
      { chapterSpanHint: "31-42章" },
      { chapterSpanHint: "43-50章" },
      { chapterSpanHint: "51-54章" },
    ],
  };

  const result = validateBeatSheetChapterCoverage({
    beatSheet,
    targetChapterCount: 54,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.requiredChapterCount, 54);
});

test("validateBeatSheetChapterCoverage rejects disconnected spans that only jump to the target", () => {
  const beatSheet = {
    beats: [
      { chapterSpanHint: "1-7章" },
      { chapterSpanHint: "54章" },
    ],
  };

  const result = validateBeatSheetChapterCoverage({
    beatSheet,
    targetChapterCount: 54,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.requiredChapterCount, 54);
  assert.equal(result.continuousChapterCount, 7);
  assert.match(result.message, /连续覆盖/);
});

test("validateBeatSheetChapterCoverage rejects overlapping spans that inflate generated chapter count", () => {
  const beatSheet = {
    beats: [
      { chapterSpanHint: "1-30章" },
      { chapterSpanHint: "20-54章" },
    ],
  };

  const result = validateBeatSheetChapterCoverage({
    beatSheet,
    targetChapterCount: 54,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.requiredChapterCount, 54);
  assert.equal(result.plannedChapterCount, 65);
  assert.match(result.message, /合计/);
});
