const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aiDirectorRiskAssessmentSchema,
  directorRiskAssessmentSchema,
  isDirectorRiskScore,
  parsePersistedDirectorRiskAssessment,
} = require("../../shared/dist/types/directorRisk.js");
test("historical director risk records remain readable on the 1-8 display scale", () => {
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
