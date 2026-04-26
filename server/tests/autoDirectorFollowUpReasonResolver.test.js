const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAutoDirectorFollowUpReason,
} = require("../dist/services/task/autoDirectorFollowUps/autoDirectorFollowUpReasonResolver.js");

function actionCodes(result) {
  return result.availableActions.map((item) => item.code);
}

test("auto director follow-up reason resolver prefers manual recovery over runtime and checkpoint signals", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "front10_ready",
    pendingManualRecovery: true,
  });

  assert.ok(result);
  assert.equal(result.reason, "manual_recovery_required");
  assert.equal(result.priority, "P0");
  assert.equal(result.availableActions[0].label, "恢复任务");
  assert.deepEqual(actionCodes(result), ["continue_generic", "open_detail"]);
  assert.equal(result.supportsBatch, false);
  assert.deepEqual(result.channelCapabilities, {
    dingtalk: true,
    wecom: true,
  });
});

test("auto director follow-up reason resolver returns candidate selection follow-up metadata", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "candidate_selection_required",
    pendingManualRecovery: false,
  });

  assert.ok(result);
  assert.equal(result.reason, "candidate_selection_required");
  assert.equal(result.priority, "P1");
  assert.deepEqual(actionCodes(result), ["go_candidate_selection", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, []);
  assert.equal(result.supportsBatch, false);
  assert.deepEqual(result.channelCapabilities, {
    dingtalk: true,
    wecom: true,
  });
});

test("auto director follow-up reason resolver returns replan follow-up metadata", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "replan_required",
  });

  assert.ok(result);
  assert.equal(result.reason, "replan_required");
  assert.equal(result.priority, "P1");
  assert.deepEqual(actionCodes(result), ["go_replan", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, []);
  assert.equal(result.supportsBatch, false);
});

test("auto director follow-up reason resolver exposes auto-execution action metadata for front10 readiness", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "front10_ready",
    executionScopeLabel: "第 11-20 章",
  });

  assert.ok(result);
  assert.equal(result.reason, "front10_execution_pending");
  assert.equal(result.priority, "P2");
  assert.deepEqual(result.availableActions[0], {
    code: "continue_auto_execution",
    kind: "mutation",
    label: "继续自动执行第 11-20 章",
    riskLevel: "low",
    requiresConfirm: false,
  });
  assert.deepEqual(actionCodes(result), ["continue_auto_execution", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, ["continue_auto_execution"]);
  assert.equal(result.supportsBatch, true);
  assert.deepEqual(result.channelCapabilities, {
    dingtalk: true,
    wecom: true,
  });
});

test("auto director follow-up reason resolver exposes paused auto-execution follow-up for chapter batches", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "chapter_batch_ready",
  });

  assert.ok(result);
  assert.equal(result.reason, "quality_repair_pending");
  assert.deepEqual(actionCodes(result), ["continue_auto_execution", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, ["continue_auto_execution"]);
  assert.equal(result.supportsBatch, true);
});

test("auto director follow-up reason resolver exposes retry-focused metadata for failed tasks", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "failed",
    checkpointType: "chapter_batch_ready",
  });

  assert.ok(result);
  assert.equal(result.reason, "runtime_failed");
  assert.equal(result.priority, "P0");
  assert.deepEqual(actionCodes(result), ["retry_with_task_model", "retry_with_route_model", "open_detail"]);
  assert.deepEqual(result.batchActionCodes, ["retry_with_task_model"]);
  assert.equal(result.supportsBatch, true);
  assert.deepEqual(result.channelCapabilities, {
    dingtalk: true,
    wecom: true,
  });
});

test("auto director follow-up reason resolver prioritizes validation blocks over runnable checkpoints", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "front10_ready",
    executionScopeLabel: "第 1-10 章",
    validationResult: {
      allowed: false,
      blockingReasons: ["目标范围缺少节奏拆章，需要先重新校验。"],
      warnings: [],
      requiredActions: [],
      affectedScope: {
        type: "chapter_range",
        label: "第 1-10 章",
        startOrder: 1,
        endOrder: 10,
      },
      nextAction: "revalidate",
    },
  });

  assert.ok(result);
  assert.equal(result.reason, "validation_required");
  assert.equal(result.priority, "P0");
  assert.deepEqual(actionCodes(result), ["open_detail"]);
  assert.equal(result.supportsBatch, false);
});

test("auto director follow-up reason resolver only marks replaced for inactive tasks", () => {
  const active = resolveAutoDirectorFollowUpReason({
    status: "running",
    checkpointType: null,
    replacementTaskId: "task_new",
  });
  assert.ok(active);
  assert.equal(active.reason, "auto_progress_running");

  const replaced = resolveAutoDirectorFollowUpReason({
    status: "succeeded",
    checkpointType: "workflow_completed",
    replacementTaskId: "task_new",
  });
  assert.ok(replaced);
  assert.equal(replaced.reason, "runtime_replaced");
  assert.deepEqual(actionCodes(replaced), ["open_detail"]);

  const cancelledReplaced = resolveAutoDirectorFollowUpReason({
    status: "cancelled",
    checkpointType: "front10_ready",
    replacementTaskId: "task_new",
  });
  assert.ok(cancelledReplaced);
  assert.equal(cancelledReplaced.reason, "runtime_replaced");
  assert.deepEqual(actionCodes(cancelledReplaced), ["open_detail"]);
});

test("auto director follow-up reason resolver allows cancelled tasks to resume or retry", () => {
  const result = resolveAutoDirectorFollowUpReason({
    status: "cancelled",
    checkpointType: "front10_ready",
    executionScopeLabel: "当前范围",
  });

  assert.ok(result);
  assert.equal(result.reason, "runtime_cancelled");
  assert.equal(result.priority, "P1");
  assert.deepEqual(actionCodes(result), [
    "continue_generic",
    "retry_with_task_model",
    "retry_with_route_model",
    "open_detail",
  ]);
  assert.deepEqual(result.batchActionCodes, ["retry_with_task_model"]);
  assert.equal(result.supportsBatch, true);
});

test("auto director follow-up reason resolver returns null for statuses and checkpoints outside P1 scope", () => {
  const running = resolveAutoDirectorFollowUpReason({
    status: "running",
    checkpointType: "front10_ready",
  });
  assert.ok(running);
  assert.equal(running.reason, "auto_progress_running");
  assert.deepEqual(actionCodes(running), ["open_detail"]);

  assert.equal(resolveAutoDirectorFollowUpReason({
    status: "waiting_approval",
    checkpointType: "book_contract_ready",
  }), null);

  assert.equal(resolveAutoDirectorFollowUpReason({
    status: "succeeded",
    checkpointType: "workflow_completed",
  }), null);
});
