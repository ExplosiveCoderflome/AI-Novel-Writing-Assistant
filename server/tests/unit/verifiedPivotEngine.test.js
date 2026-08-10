const test = require("node:test");
const assert = require("node:assert/strict");
const { verifiedPivotEngine } = require("../../dist/services/novel/director/automation/verifiedPivotEngine.js");

test("GA-Argus VerifiedPivotEngine Unit Tests", async (t) => {
  const mockContract = {
    novelId: "test-novel-404",
    version: 1,
    standingIntent: {
      bookId: "test-novel-404",
      coreTheme: "热血仙侠",
      targetAudience: "爽文",
      protagonistArc: "逆天改命",
      nonNegotiableRules: ["主角绝不跪地求饶"],
    },
    operationalObjective: {
      stage: "chapter_production",
      targetVolumeOrder: 1,
      targetChapterRange: { start: 1, end: 10 },
      dramaticGoal: "宗门大比擂台决战",
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

  await t.test("executes Pivot successfully when proposed objective is valid", async () => {
    const request = {
      novelId: "test-novel-404",
      triggerSource: "REVIEWER_REPLAN",
      failedPlanSummary: "主角挑战阵法失败死掉",
      rejectionReason: "剧情崩坏",
      rootCauseCode: "TIMELINE_PARADOX",
    };

    const result = await verifiedPivotEngine.executePivot(mockContract, request);

    assert.equal(result.admitted, true);
    assert.ok(result.updatedContract.version > mockContract.version);
    assert.match(result.newFalsifiedRoute.negativePromptConstraint, /TIMELINE_PARADOX/);
  });
});
