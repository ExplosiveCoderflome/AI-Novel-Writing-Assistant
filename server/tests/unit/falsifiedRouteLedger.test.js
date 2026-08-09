const test = require("node:test");
const assert = require("node:assert/strict");
const { falsifiedRouteLedgerService } = require("../../dist/services/novel/director/state/falsifiedRouteLedger.js");

test("GA-Argus FalsifiedRouteLedger Unit Tests", async (t) => {
  const mockRoutes = [
    {
      novelId: "test-novel-202",
      volumeOrder: 1,
      chapterOrder: 3,
      failedPlanSummary: "主角向反派跪地求饶并自废修为",
      rejectionReason: "严重违背主角性格弧光与爽点设定",
      rootCauseCode: "CHARACTER_OOC",
      negativePromptConstraint: "严禁安排主角向敌人求饶或自废修为",
    },
    {
      novelId: "test-novel-202",
      volumeOrder: 1,
      chapterOrder: 5,
      failedPlanSummary: "主角吃废丹直接突破境界",
      rejectionReason: "与前面丹毒必死设定严重冲突",
      rootCauseCode: "TIMELINE_PARADOX",
      negativePromptConstraint: "严禁安排主角通过吃废丹突破",
    },
  ];

  await t.test("formats negative constraints for prompt injection", async () => {
    const formatted = falsifiedRouteLedgerService.formatNegativeConstraintsForPrompt(mockRoutes);

    assert.equal(formatted.length, 2);
    assert.match(formatted[0], /CHARACTER_OOC/);
    assert.match(formatted[0], /严禁安排主角向敌人求饶/);
    assert.match(formatted[1], /TIMELINE_PARADOX/);
    assert.match(formatted[1], /严禁安排主角通过吃废丹突破/);
  });
});
