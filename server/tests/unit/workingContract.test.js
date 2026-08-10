const test = require("node:test");
const assert = require("node:assert/strict");
const { workingContractService } = require("../../dist/services/novel/director/contract/workingContract.js");

test("GA-Argus WorkingContract Unit Tests", async (t) => {
  const mockStandingIntent = {
    bookId: "test-novel-101",
    coreTheme: "热血仙侠逆袭",
    targetAudience: "男频爽文",
    protagonistArc: "从废柴弟子成长为宗门至尊",
    nonNegotiableRules: ["主角绝不跪地求饶", "不虐主"],
  };

  const mockOperationalObjective = {
    stage: "chapter_production",
    targetVolumeOrder: 1,
    targetChapterRange: { start: 1, end: 10 },
    dramaticGoal: "完成宗门大比决胜局并击败对立长老弟子",
    pacingTarget: "fast",
  };

  await t.test("validates valid operational objective against standing intent invariance", async () => {
    const result = workingContractService.validateStandingIntentInvariance(
      mockStandingIntent,
      mockOperationalObjective
    );

    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });

  await t.test("REJECTS operational objective when dramaticGoal is empty", async () => {
    const invalidObjective = { ...mockOperationalObjective, dramaticGoal: "" };
    const result = workingContractService.validateStandingIntentInvariance(
      mockStandingIntent,
      invalidObjective
    );

    assert.equal(result.valid, false);
    assert.match(result.reason, /cannot be empty/);
  });

  await t.test("REJECTS operational objective when it violates StandingIntent non-negotiable rules", async () => {
    const invalidObjective = {
      ...mockOperationalObjective,
      dramaticGoal: "主角向反派跪地求饶求放过",
    };

    const result = workingContractService.validateStandingIntentInvariance(
      mockStandingIntent,
      invalidObjective
    );

    assert.equal(result.valid, false);
    assert.match(result.reason, /violates StandingIntent non-negotiable rule/);
  });
});
