const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAutoDirectorFollowUpReason,
} = require("../dist/services/task/autoDirectorFollowUps/autoDirectorFollowUpReasonResolver.js");

test("resolveAutoDirectorFollowUpReason prioritizes pending manual recovery", () => {
  const resolved = resolveAutoDirectorFollowUpReason({
    status: "running",
    pendingManualRecovery: true,
    checkpointType: "front10_ready",
    executionScopeLabel: "前 10 章",
  });

  assert.ok(resolved);
  assert.equal(resolved.reason, "manual_recovery_required");
  assert.equal(resolved.priority, "P0");
  assert.deepEqual(
    resolved.availableActions.map((item) => item.code),
    ["continue_generic", "open_detail"],
  );
});

test("resolveAutoDirectorFollowUpReason maps candidate selection to navigation actions", () => {
  const resolved = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "candidate_selection_required",
  });

  assert.ok(resolved);
  assert.equal(resolved.reason, "candidate_selection_required");
  assert.deepEqual(
    resolved.availableActions.map((item) => item.code),
    ["go_candidate_selection", "open_detail"],
  );
  assert.equal(resolved.supportsBatch, false);
});

test("resolveAutoDirectorFollowUpReason keeps chapter batch continuation batchable", () => {
  const resolved = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
    executionScopeLabel: "当前章节范围",
  });

  assert.ok(resolved);
  assert.equal(resolved.reason, "quality_repair_pending");
  assert.deepEqual(resolved.batchActionCodes, ["continue_auto_execution"]);
  assert.equal(resolved.supportsBatch, true);
});
