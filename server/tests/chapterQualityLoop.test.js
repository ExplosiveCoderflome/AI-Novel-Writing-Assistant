const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterQualityLoopAssessment,
  classifyChapterQualityLoopRiskFlags,
  hasContinuableChapterQualityLoopRiskFlags,
} = require("../../shared/dist/types/chapterQualityLoop.js");
const {
  buildChapterQualityLoopChapterUpdate,
} = require("../dist/services/novel/quality/ChapterQualityLoopService.js");

function score(overrides = {}) {
  return {
    coherence: 88,
    repetition: 88,
    pacing: 86,
    voice: 85,
    engagement: 88,
    overall: 87,
    ...overrides,
  };
}

test("buildChapterQualityLoopAssessment continues when quality signals are valid", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-1",
    chapterOrder: 1,
    score: score(),
    issues: [],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  assert.equal(assessment.overallStatus, "valid");
  assert.equal(assessment.recommendedAction, "continue");
  assert.equal(assessment.patchFirstRequired, false);
  assert.equal(assessment.recheckRequired, false);
  assert.equal(assessment.signals.length, 3);
});

test("buildChapterQualityLoopAssessment requires patch-first repair for local quality risk", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-2",
    chapterOrder: 2,
    score: score({ engagement: 68, overall: 70 }),
    issues: [{
      severity: "high",
      category: "pacing",
      evidence: "结尾缺少推进和拉力。",
      fixSuggestion: "补强结尾钩子。",
    }],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  assert.equal(assessment.overallStatus, "risk");
  assert.equal(assessment.recommendedAction, "patch_repair");
  assert.equal(assessment.patchFirstRequired, true);
  assert.equal(assessment.recheckRequired, true);
});

test("buildChapterQualityLoopAssessment routes rolling window failures to replan", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-3",
    chapterOrder: 3,
    score: score(),
    issues: [],
    runtimePackage: {
      context: {
        chapter: { order: 3 },
      },
      audit: {
        reports: [],
        openIssues: [],
      },
      replanRecommendation: {
        recommended: true,
        reason: "连续三章推进偏离主线。",
        blockingIssueIds: ["issue-1"],
        blockingLedgerKeys: [],
        affectedChapterOrders: [3, 4],
      },
      failureClassification: {
        code: "replan_required",
        summary: "章节职责与计划窗口失配。",
        decisionReason: "需要重排邻近章节。",
        blockingObligations: [{
          kind: "goal_change",
          summary: "角色目标变化未兑现。",
          evidence: "正文没有体现目标变化。",
        }],
      },
    },
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  assert.equal(assessment.overallStatus, "invalid");
  assert.equal(assessment.recommendedAction, "replan");
  assert.equal(assessment.patchFirstRequired, true);
  assert.equal(assessment.recheckRequired, true);
  assert.equal(assessment.budget.nextAction, "patch_repair");
  assert.equal(
    assessment.signals.find((signal) => signal.artifactType === "rolling_window_review").status,
    "invalid",
  );
  assert.equal(assessment.rootCauseCode, "replan_required");
  assert.equal(assessment.blockingObligations[0].kind, "goal_change");
});

test("buildChapterQualityLoopAssessment treats low repetition control as a repair risk", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-repetition",
    chapterOrder: 5,
    score: score({ repetition: 60 }),
    issues: [],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  assert.equal(assessment.overallStatus, "invalid");
  assert.equal(assessment.recommendedAction, "patch_repair");
  assert.equal(assessment.budget.nextAction, "patch_repair");
});

test("buildChapterQualityLoopAssessment escalates repeated quality signatures by budget", () => {
  const first = buildChapterQualityLoopAssessment({
    chapterId: "chapter-budget",
    chapterOrder: 6,
    score: score({ repetition: 60 }),
    issues: [],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });
  const history = [
    `[quality_loop 2026-04-30T00:00:00.000Z] status=${first.overallStatus} action=${first.recommendedAction} signature=${first.budget.signature} attempt=1/3 budget=${first.budget.nextAction}`,
    `[quality_loop 2026-04-30T00:01:00.000Z] status=${first.overallStatus} action=${first.recommendedAction} signature=${first.budget.signature} attempt=2/3 budget=rewrite_chapter`,
    `[quality_loop 2026-04-30T00:02:00.000Z] status=${first.overallStatus} action=${first.recommendedAction} signature=${first.budget.signature} attempt=3/3 budget=replan_window`,
  ].join("\n");

  const exhausted = buildChapterQualityLoopAssessment({
    chapterId: "chapter-budget",
    chapterOrder: 6,
    score: score({ repetition: 60 }),
    issues: [],
    previousRepairHistory: history,
    evaluatedAt: "2026-04-30T00:03:00.000Z",
  });

  assert.equal(exhausted.recommendedAction, "manual_gate");
  assert.equal(exhausted.budget.attempt, 4);
  assert.equal(exhausted.budget.nextAction, "hard_stop");
  assert.equal(exhausted.budget.exhausted, true);
});

test("buildChapterQualityLoopChapterUpdate clears stale repair state after a valid repair recheck", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-4",
    chapterOrder: 4,
    score: score(),
    issues: [],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  const update = buildChapterQualityLoopChapterUpdate({
    riskFlags: JSON.stringify({ qualityLoop: { recommendedAction: "patch_repair" } }),
    repairHistory: "[quality_loop old] status=invalid action=replan",
    chapterStatus: "needs_repair",
    generationState: "reviewed",
  }, assessment, "repair_recheck");

  assert.equal(update.chapterStatus, "pending_review");
  assert.equal(typeof update.riskFlags, "string");
  const riskFlags = JSON.parse(update.riskFlags);
  assert.equal(riskFlags.qualityLoop.recommendedAction, "continue");
  assert.equal(riskFlags.qualityLoop.source, "repair_recheck");
});

test("buildChapterQualityLoopChapterUpdate marks exhausted auto repair as deferred continue", () => {
  const assessment = buildChapterQualityLoopAssessment({
    chapterId: "chapter-5",
    chapterOrder: 5,
    score: score({ engagement: 69, overall: 70 }),
    issues: [{
      severity: "high",
      category: "pacing",
      evidence: "结尾仍然缺少推进。",
      fixSuggestion: "补足章节收束。",
    }],
    evaluatedAt: "2026-04-30T00:00:00.000Z",
  });

  const update = buildChapterQualityLoopChapterUpdate({
    riskFlags: JSON.stringify({ qualityLoop: { recommendedAction: "patch_repair" } }),
    repairHistory: "[quality_loop old] status=invalid action=patch_repair",
    chapterStatus: "needs_repair",
    generationState: "reviewed",
  }, assessment, "repair_recheck", "defer_and_continue");

  assert.equal(update.chapterStatus, "pending_review");
  assert.equal(typeof update.riskFlags, "string");
  const riskFlags = JSON.parse(update.riskFlags);
  assert.equal(riskFlags.qualityLoop.terminalAction, "defer_and_continue");
  assert.equal(riskFlags.qualityLoop.source, "repair_recheck");
  assert.match(update.repairHistory, /terminal=defer_and_continue/);
});

test("quality loop projection classifies deferred patch repair as non-blocking debt", () => {
  const riskFlags = JSON.stringify({
    qualityLoop: {
      overallStatus: "invalid",
      recommendedAction: "patch_repair",
      rootCauseCode: "draft_repair_exhausted",
      terminalAction: "defer_and_continue",
    },
  });

  assert.equal(classifyChapterQualityLoopRiskFlags(riskFlags), "non_blocking_quality_debt");
  assert.equal(hasContinuableChapterQualityLoopRiskFlags(riskFlags), true);
});

test("quality loop projection keeps replan required blocking even when deferred", () => {
  const riskFlags = JSON.stringify({
    qualityLoop: {
      overallStatus: "invalid",
      recommendedAction: "replan",
      rootCauseCode: "replan_required",
      terminalAction: "defer_and_continue",
      blockingObligations: [{ kind: "must_hit_now", summary: "比武环节" }],
    },
  });

  assert.equal(classifyChapterQualityLoopRiskFlags(riskFlags), "blocking");
  assert.equal(hasContinuableChapterQualityLoopRiskFlags(riskFlags), false);
});
