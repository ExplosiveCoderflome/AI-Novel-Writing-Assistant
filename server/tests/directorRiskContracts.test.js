const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_RISK_POLICY,
  aiDirectorRiskAssessmentSchema,
  directorRiskAssessmentSchema,
  directorRiskPolicySchema,
  isDirectorRiskScore,
  parsePersistedDirectorRiskAssessment,
  parsePersistedDirectorRiskPolicy,
} = require("../../shared/dist/types/directorRisk.js");
const {
  directorRiskAssessmentPrompt,
} = require("../dist/prompting/prompts/director/directorRiskAssessment.prompts.js");
const {
  getRegisteredPromptAsset,
} = require("../dist/prompting/registry.js");
const {
  resolveDirectorRiskDecision,
} = require("../dist/services/novel/director/risk/DirectorRiskAssessmentService.js");

test("director risk policy applies the 5/8 defaults and rejects invalid threshold order", () => {
  assert.deepEqual(directorRiskPolicySchema.parse({}), DEFAULT_DIRECTOR_RISK_POLICY);
  assert.deepEqual(directorRiskPolicySchema.parse({ noticeThreshold: 6, pauseThreshold: 7 }), {
    noticeThreshold: 6,
    pauseThreshold: 7,
  });
  assert.equal(directorRiskPolicySchema.safeParse({ noticeThreshold: 8, pauseThreshold: 8 }).success, false);
  assert.equal(directorRiskPolicySchema.safeParse({ noticeThreshold: 1, pauseThreshold: 8 }).success, false);
  assert.equal(directorRiskPolicySchema.safeParse({ noticeThreshold: 5, pauseThreshold: 9 }).success, false);
  assert.deepEqual(
    parsePersistedDirectorRiskPolicy({ noticeThreshold: 6, pauseThreshold: 7 }),
    { noticeThreshold: 6, pauseThreshold: 7 },
  );
});

test("director risk assessment schema preserves scored AI evidence and runtime handling", () => {
  const aiAssessment = aiDirectorRiskAssessmentSchema.parse({
    score: 8,
    category: "replan",
    impactScope: "chapter_range",
    affectedChapterOrders: [7, 8],
    evidenceSummary: "第 7 章的关键转折缺失，后续两章的既定任务无法成立。",
    recommendation: "replan",
    recommendationReason: "应在当前章节完成持久化后重新规划第 7 至 8 章。",
    canPause: true,
  });
  const persisted = directorRiskAssessmentSchema.parse({
    ...aiAssessment,
    action: "pause_requested",
    assessedAt: "2026-08-07T00:00:00.000Z",
    issueFingerprint: "replan:chapter-7",
  });

  assert.equal(persisted.score, 8);
  assert.deepEqual(persisted.affectedChapterOrders, [7, 8]);
  assert.equal(isDirectorRiskScore(8), true);
  assert.equal(isDirectorRiskScore(9), false);
  assert.equal(isDirectorRiskScore(0), false);

  const legacy = parsePersistedDirectorRiskAssessment({ ...persisted, score: 10 });
  assert.equal(legacy?.score, 8);
});

test("director risk assessment prompt is registered with a strict structured contract", () => {
  const registered = getRegisteredPromptAsset("director.risk.assessment", "v1");
  assert.equal(registered, directorRiskAssessmentPrompt);
  assert.equal(directorRiskAssessmentPrompt.taskType, "critical_review");
  assert.equal(directorRiskAssessmentPrompt.mode, "structured");
  assert.equal(directorRiskAssessmentPrompt.outputSchema, aiDirectorRiskAssessmentSchema);

  const messages = directorRiskAssessmentPrompt.render({
    failureStage: "chapter_acceptance",
    failureType: "quality_debt",
    failureSummary: "第 4 章局部伏笔仍需补写",
    failureDetailsJson: "{}",
    taskContextJson: "{}",
    auditReportsJson: "[]",
    replanDecisionJson: "null",
    existingQualityDebtJson: "[]",
  }, { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
  assert.match(String(messages[0].content), /canPause 必须为 false/);
  assert.match(String(messages[0].content), /数据完整性/);
});

test("forced stops use the capped 8-point score and local quality debt never pauses the book", () => {
  const assessment = {
    score: 8,
    category: "chapter_repair",
    impactScope: "current_chapter",
    affectedChapterOrders: [4],
    evidenceSummary: "本章仍有可修复的问题。",
    recommendation: "local_repair",
    recommendationReason: "记录质量债后继续。",
    canPause: true,
  };
  const local = resolveDirectorRiskDecision({
    assessment,
    policy: DEFAULT_DIRECTOR_RISK_POLICY,
    localOnly: true,
  });
  assert.equal(local.shouldNotify, true);
  assert.equal(local.shouldPause, false);

  const forced = resolveDirectorRiskDecision({
    assessment: { ...assessment, score: 1 },
    policy: DEFAULT_DIRECTOR_RISK_POLICY,
    forcePause: true,
  });
  assert.equal(forced.score, 8);
  assert.equal(forced.shouldPause, true);
});
