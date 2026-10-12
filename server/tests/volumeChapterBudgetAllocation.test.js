const test = require("node:test");
const assert = require("node:assert/strict");

const {
  allocateChapterBudgets,
  deriveChapterBudget,
  resolveEvenShareChapterBudget,
} = require("../dist/services/novel/volume/volumeChapterBudgetAllocation.js");
const {
  inferRequiredChapterCountFromBeatSheet,
  resolveTargetChapterCount,
} = require("../dist/services/novel/volume/volumeBeatSheetChapterBudget.js");
const {
  resolveBeatSheetTargetChapterCount,
} = require("../dist/services/novel/volume/volumeBeatSheetGeneration.js");

function makeVolumes(counts) {
  return counts.map((chapterCount, index) => ({
    id: `vol-${index + 1}`,
    chapters: Array.from({ length: chapterCount }, (_, chapterIndex) => ({
      id: `vol-${index + 1}-ch-${chapterIndex + 1}`,
    })),
  }));
}

test("resolveEvenShareChapterBudget 返回均分份额且不低于 3", () => {
  assert.equal(resolveEvenShareChapterBudget(446, 9), 50);
  assert.equal(resolveEvenShareChapterBudget(10, 9), 3);
  assert.equal(resolveEvenShareChapterBudget(100, 0), 100);
});

test("allocateChapterBudgets 在有卷不足 3 章时均分", () => {
  const budgets = allocateChapterBudgets({
    volumeCount: 9,
    chapterBudget: 446,
    existingVolumes: makeVolumes([55, 55, 55, 55, 55, 55, 55, 55, 0]),
  });
  assert.equal(budgets.length, 9);
  // 均分：每卷约 49-50 章
  assert.ok(budgets[8] >= 49 && budgets[8] <= 50);
});

test("allocateChapterBudgets 在各卷都有 3 章以上时按现有章数加权", () => {
  const budgets = allocateChapterBudgets({
    volumeCount: 2,
    chapterBudget: 100,
    existingVolumes: makeVolumes([80, 20]),
  });
  // 80:20 加权 → 约 80 / 20
  assert.ok(budgets[0] > budgets[1]);
  assert.equal(budgets[0] + budgets[1], 100);
});

test("issue #173 回归：写作中的卷预算不得低于均分份额", () => {
  // reporter 场景：前 8 卷 443 章，第 9 卷已生成 3 章（开卷抓手），节奏板规划 55 章
  const volumes = makeVolumes([55, 55, 55, 55, 55, 55, 55, 58, 3]);
  const chapterBudget = deriveChapterBudget({ novel: {}, workspace: { volumes }, options: {} });
  assert.equal(chapterBudget, 446);

  const chapterBudgets = allocateChapterBudgets({
    volumeCount: 9,
    chapterBudget,
    existingVolumes: volumes,
  });
  const targetIndex = 8;

  // 修复前：加权只给第 9 卷 3 章预算 → 55 > maxTrusted(9) → 抛"跨度异常"
  const beforeFix = resolveTargetChapterCount({
    budgetedChapterCount: Math.max(volumes[targetIndex].chapters.length, chapterBudgets[targetIndex]),
    beatSheetRequiredChapterCount: 55,
  });
  assert.equal(beforeFix.beatSheetCountAccepted, false);

  // 修复后：兜底均分份额（与 generateBeatChunkedChapterList 同逻辑）
  const fallbackTargetChapterCount = Math.max(
    chapterBudgets[targetIndex] ?? 0,
    resolveEvenShareChapterBudget(chapterBudget, volumes.length),
  );
  assert.ok(fallbackTargetChapterCount >= 50);

  const beatSheet = {
    beats: ["1-3章", "4-10章", "11-20章", "21-30章", "31-40章", "41-48章", "49-52章", "53-55章"]
      .map((chapterSpanHint) => ({ chapterSpanHint })),
  };
  const beatSheetRequiredChapterCount = inferRequiredChapterCountFromBeatSheet(beatSheet);
  assert.equal(beatSheetRequiredChapterCount, 55);

  const resolved = resolveTargetChapterCount({
    budgetedChapterCount: Math.max(volumes[targetIndex].chapters.length, fallbackTargetChapterCount),
    beatSheetRequiredChapterCount,
  });
  assert.equal(resolved.beatSheetCountAccepted, true);
  assert.equal(resolved.targetChapterCount, 55);
});

test("resolveBeatSheetTargetChapterCount 给写作中的卷均分兜底", () => {
  // 第 9 卷已有 3 章时重生成节奏板：加权预算只有 3，不应再喂给 AI"目标 3 章"
  const targetChapterCount = resolveBeatSheetTargetChapterCount({
    targetVolumeChapterCount: 3,
    targetVolumeIndex: 8,
    volumeCount: 9,
    chapterBudget: 446,
    chapterBudgets: [55, 55, 55, 55, 55, 55, 55, 58, 3],
  });
  assert.ok(targetChapterCount >= 50);
});

test("resolveBeatSheetTargetChapterCount 保持原有行为：取三者最大", () => {
  assert.equal(
    resolveBeatSheetTargetChapterCount({
      targetVolumeChapterCount: 60,
      targetVolumeIndex: 0,
      volumeCount: 9,
      chapterBudget: 446,
      chapterBudgets: [55, 55, 55, 55, 55, 55, 55, 58, 3],
    }),
    60,
  );
});
