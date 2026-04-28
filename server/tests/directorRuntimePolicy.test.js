const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorPolicyEngine,
} = require("../dist/services/novel/director/runtime/DirectorPolicyEngine.js");

test("director runtime policy keeps suggest-only runs from writing", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "suggest_only",
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.autoRetryBudget, 0);
});

test("director runtime policy protects user-edited artifacts from overwrite", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "auto_safe_scope",
    affectedArtifacts: [
      {
        id: "chapter_draft:chapter:c1:Chapter:c1",
        novelId: "novel-1",
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: "c1",
        version: 1,
        status: "active",
        source: "user_edited",
        contentRef: { table: "Chapter", id: "c1" },
        schemaVersion: "test",
      },
    ],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.mayOverwriteUserContent, true);
});

test("director runtime policy allows one automatic repair attempt", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "repair",
    mode: "run_until_gate",
    qualityGateResult: {
      status: "repairable",
      repairPlanId: "repair-1",
      autoRetryAllowed: true,
    },
  });

  assert.equal(decision.canRun, true);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.autoRetryBudget, 1);
  assert.equal(decision.onQualityFailure, "repair_once");
});

test("director runtime policy gates default-approval nodes outside safe auto scope", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "run_until_gate",
    requiresApprovalByDefault: true,
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.match(decision.reason, /需要确认/);
});
