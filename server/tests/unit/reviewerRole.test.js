const test = require("node:test");
const assert = require("node:assert/strict");
const { reviewerRole } = require("../../dist/services/novel/director/roles/reviewerRole.js");

test("GA-Argus ReviewerRole Structured Audit Unit Tests", async (t) => {
  const mockContract = {
    novelId: "test-novel-303",
    version: 1,
    standingIntent: {
      bookId: "test-novel-303",
      coreTheme: "热血仙侠",
      targetAudience: "爽文",
      protagonistArc: "从凡人到至尊",
      nonNegotiableRules: ["主角绝不跪地求饶"],
    },
    operationalObjective: {
      stage: "chapter_production",
      targetVolumeOrder: 1,
      targetChapterRange: { start: 1, end: 10 },
      dramaticGoal: "击败宗门大比擂台对手",
      pacingTarget: "fast",
    },
    constraints: {
      wordCountRange: { min: 2000, max: 4000 },
      forbiddenTropes: [],
      activeFalsifiedRoutes: [],
    },
    verificationCriteria: {
      characterConsistencyMinScore: 80,
      payoffFulfillmentRequired: true,
      timelineIntegrityRequired: true,
    },
  };

  const mockFalsifiedRoutes = [
    {
      novelId: "test-novel-303",
      failedPlanSummary: "主角吃废丹突破",
      rejectionReason: "设定冲突",
      rootCauseCode: "TIMELINE_PARADOX",
      negativePromptConstraint: "严禁安排主角通过吃废丹突破",
    },
  ];

  await t.test("returns 'done' when draft is clean and meets constraints", async () => {
    const cleanDraft = "主角剑指对手，冷声道：“今日一战，我定不负宗门。”";
    const verdict = reviewerRole.auditArtifact(cleanDraft, mockContract, mockFalsifiedRoutes);

    assert.equal(verdict.verdict, "done");
  });

  await t.test("returns 'continue' with patch instructions when minor defect exists", async () => {
    const defectDraft = "主角与对手交战。缺少动作描写。";
    const verdict = reviewerRole.auditArtifact(defectDraft, mockContract, mockFalsifiedRoutes);

    assert.equal(verdict.verdict, "continue");
    assert.match(verdict.patchInstructions, /微表情/);
  });

  await t.test("returns 'defer_and_continue' with quality debt summary when minor typos exist", async () => {
    const debtDraft = "主角大喊一声，语气词稍多。";
    const verdict = reviewerRole.auditArtifact(debtDraft, mockContract, mockFalsifiedRoutes);

    assert.equal(verdict.verdict, "defer_and_continue");
    assert.match(verdict.qualityDebtSummary, /质量债务/);
  });

  await t.test("returns 'replan_required' when StandingIntent non-negotiable rule is violated", async () => {
    const invalidDraft = "主角跪地求饶求反派放过。";
    const verdict = reviewerRole.auditArtifact(invalidDraft, mockContract, mockFalsifiedRoutes);

    assert.equal(verdict.verdict, "replan_required");
    assert.equal(verdict.rootCauseCode, "CHARACTER_OOC");
  });

  await t.test("returns 'replan_required' when dead branch is repeated", async () => {
    const deadBranchDraft = "主角在密室里吃废丹暴涨修为。";
    const verdict = reviewerRole.auditArtifact(deadBranchDraft, mockContract, mockFalsifiedRoutes);

    assert.equal(verdict.verdict, "replan_required");
    assert.equal(verdict.rootCauseCode, "TIMELINE_PARADOX");
  });
});
