const test = require("node:test");
const assert = require("node:assert/strict");
const { threeTierMemoryService } = require("../dist/services/novel/memory/ThreeTierMemoryService.js");

test("PAI Insight 3: Three-Tier Memory Architecture & Budget Allocation", async (t) => {
  await t.test("calculates default 15%/35%/50% memory budgets when Warm memory is present", () => {
    const budgets = threeTierMemoryService.calculateMemoryBudgets(4000, true);
    assert.equal(budgets.hotMax, 600);   // 15%
    assert.equal(budgets.coldMax, 1400); // 35%
    assert.equal(budgets.warmMax, 2000); // 50%
  });

  await t.test("dynamically reallocates Warm budget (70% to Cold, 30% to Hot) when Warm memory is missing", () => {
    // Total: 4000. Warm = 2000.
    // Reallocation: Cold += 2000 * 0.7 = 1400. Cold total = 1400 + 1400 = 2800.
    // Hot += 2000 * 0.3 = 600. Hot total = 600 + 600 = 1200. Warm = 0.
    const budgets = threeTierMemoryService.calculateMemoryBudgets(4000, false);
    assert.equal(budgets.hotMax, 1200);
    assert.equal(budgets.coldMax, 2800);
    assert.equal(budgets.warmMax, 0);
  });

  await t.test("assembles block-delimited Hot/Cold/Warm context text", () => {
    const contextText = threeTierMemoryService.assembleThreeTierContext({
      hot: {
        sessionInstruction: "少用形容词，语言偏向阴郁古风",
        inlineFeedback: ["第二段缺乏心理描写"],
      },
      cold: {
        worldAxioms: ["贾史王薛四大家族同气连枝", "太虚幻境执掌红尘命运"],
        characterImmutableRules: ["林黛玉才情敏感，不可粗俗"],
        masterNovelOutline: "悲剧宿命与木石前盟",
      },
      warm: {
        rollingSummaries: [
          { chapterOrder: 1, chapterTitle: "破晓", summary: "宝玉梦演红楼梦曲" },
        ],
      },
      totalTokenBudget: 4000,
    });

    assert.match(contextText, /=== \[HOT MEMORY - Immediate Session & Feedback\] ===/);
    assert.match(contextText, /=== \[COLD MEMORY - Immutable World Axioms & Character Rules\] ===/);
    assert.match(contextText, /=== \[WARM MEMORY - Recent 3-5 Chapter Summaries & Plot Momentum\] ===/);
    assert.match(contextText, /语言偏向阴郁古风/);
    assert.match(contextText, /贾史王薛四大家族同气连枝/);
    assert.match(contextText, /宝玉梦演红楼梦曲/);
  });

  await t.test("captures interactive feedback signals in LRU memory store", () => {
    const novelId = `test-novel-signal-${Date.now()}`;
    threeTierMemoryService.captureFeedbackSignal(novelId, "inline_comment", "减少标点符号的使用");

    const signals = threeTierMemoryService.getFeedbackSignals(novelId);
    assert.equal(signals.length, 1);
    assert.match(signals[0], /减少标点符号的使用/);
  });
});
