const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorPolicyEngine,
} = require("../../dist/services/novel/director/runtime/DirectorPolicyEngine.js");

function buildArtifact(patch = {}) {
  return {
    id: "chapter_draft:chapter:c1:Chapter:c1",
    novelId: "novel-1",
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: "c1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "Chapter", id: "c1" },
    schemaVersion: "test",
    ...patch,
  };
}

test("director runtime policy keeps suggest-only runs from writing", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "suggest_only",
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.deepEqual(decision.riskTags, ["suggest_only"]);
  assert.equal(decision.autoRetryBudget, 0);
});

test("director runtime policy protects user-edited artifacts from overwrite", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "auto_safe_scope",
    affectedArtifacts: [
      buildArtifact({ source: "user_edited" }),
    ],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.equal(decision.mayOverwriteUserContent, true);
  assert.deepEqual(decision.riskTags, ["protected_user_content"]);
});

test("director runtime policy treats possible chapter writes as risky but runnable until protected content is affected", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "run_until_gate",
    mayOverwriteUserContent: true,
    affectedArtifacts: [buildArtifact()],
  });

  assert.equal(decision.canRun, true);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.gateType, "none");
  assert.equal(decision.mayOverwriteUserContent, true);
});

test("director runtime policy also protects artifacts explicitly marked as user content", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "auto_safe_scope",
    affectedArtifacts: [
      buildArtifact({
        id: "chapter_draft:chapter:c2:Chapter:c2",
        targetId: "c2",
        protectedUserContent: true,
      }),
    ],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.equal(decision.mayOverwriteUserContent, true);
  assert.deepEqual(decision.riskTags, ["protected_user_content"]);
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
  assert.equal(decision.gateType, "none");
  assert.equal(decision.autoRetryBudget, 1);
  assert.equal(decision.onQualityFailure, "repair_once");
  assert.deepEqual(decision.riskTags, ["quality_repair"]);
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
  assert.equal(decision.gateType, "approval");
  assert.deepEqual(decision.riskTags, ["default_approval"]);
});

test("director runtime policy gates expensive review unless explicitly allowed", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "run_until_gate",
    writes: ["audit_report", "rolling_window_review"],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.deepEqual(decision.riskTags, ["expensive_review"]);
});

test("director runtime policy allows approved auto execution review scope", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    policy: {
      mode: "auto_safe_scope",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: true,
      modelTier: "balanced",
      updatedAt: "2026-04-29T00:00:00.000Z",
    },
    writes: ["audit_report", "rolling_window_review"],
  });

  assert.equal(decision.canRun, true);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.gateType, "none");
});

test("director runtime policy gates downstream recompute for existing upstream artifacts", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "run_until_gate",
    writes: ["volume_strategy"],
    affectedArtifacts: [
      buildArtifact({
        id: "volume_strategy:novel:novel-1:Novel:novel-1",
        artifactType: "volume_strategy",
        targetType: "novel",
        targetId: "novel-1",
        contentRef: { table: "Novel", id: "novel-1" },
      }),
    ],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.deepEqual(decision.riskTags, ["downstream_recompute"]);
});

test("director runtime policy gates large-scope chapter automation outside safe auto scope", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "run_until_gate",
    targetType: "novel",
    targetId: "novel-1",
    writes: ["chapter_draft"],
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "approval");
  assert.deepEqual(decision.riskTags, ["large_scope_auto_run"]);
});

test("director runtime policy blocks only the affected quality scope", () => {
  const engine = new DirectorPolicyEngine();
  const decision = engine.decide({
    action: "run_node",
    mode: "auto_safe_scope",
    qualityGateResult: {
      status: "blocked_scope",
      blockedScope: "chapter:chapter-1",
      reason: "chapter blocked",
    },
  });

  assert.equal(decision.canRun, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.gateType, "blocked_scope");
  assert.deepEqual(decision.riskTags, ["quality_blocked_scope"]);
  assert.equal(decision.onQualityFailure, "block_scope");
});
