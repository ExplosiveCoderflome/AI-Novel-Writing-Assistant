const test = require("node:test");
const assert = require("node:assert/strict");

const { DirectorTaskStateWriter } = require("../dist/services/novel/director/state/index.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");

test("semantic state transitions delegate to their workflow application methods", async () => {
  const calls = [];
  const workflow = {
    async recordCheckpoint(taskId, input) {
      calls.push(["completed", taskId, input]);
      return { id: taskId, status: "succeeded" };
    },
    async cancelTask(taskId) {
      calls.push(["cancelled", taskId]);
      return { id: taskId, status: "cancelled" };
    },
    async requeueTaskForRecovery(taskId, message, patch) {
      calls.push(["manual-recovery", taskId, message, patch]);
      return { id: taskId, status: "queued", pendingManualRecovery: true };
    },
  };
  const writer = new DirectorTaskStateWriter(workflow);

  await writer.markCompleted("task-complete", {
    stage: "chapter_execution",
    itemLabel: "全书已完成",
    checkpointSummary: "全书正文已完成。",
  });
  await writer.markCancelled("task-cancelled");
  await writer.markPendingManualRecovery("task-paused", "等待用户恢复", { stage: "chapter_execution" });

  assert.deepEqual(calls, [
    ["completed", "task-complete", {
      stage: "chapter_execution",
      checkpointType: "workflow_completed",
      itemLabel: "全书已完成",
      checkpointSummary: "全书正文已完成。",
    }],
    ["cancelled", "task-cancelled"],
    ["manual-recovery", "task-paused", "等待用户恢复", { stage: "chapter_execution" }],
  ]);
});

test("markRunning does not clear a pending manual recovery lock", async () => {
  const task = {
    id: "task-locked",
    novelId: "novel-1",
    lane: "auto_director",
    status: "queued",
    progress: 0.2,
    startedAt: null,
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "等待用户恢复",
    currentStage: "chapter_execution",
    currentItemKey: "chapter_batch_ready",
    currentItemLabel: "等待用户恢复",
    pendingManualRecovery: true,
    cancelRequestedAt: null,
    seedPayloadJson: null,
  };
  const updates = [];
  const workflow = new NovelWorkflowService();
  workflow.getTaskById = async () => task;
  workflow.buildResumeTarget = () => ({ route: "/novels/novel-1/edit" });
  workflow.updateWorkflowTaskWithNotifications = async ({ before, data }) => {
    updates.push(data);
    return { ...before, ...data };
  };
  const writer = new DirectorTaskStateWriter(workflow);

  const updated = await writer.markRunning("task-locked", {
    stage: "chapter_execution",
    itemLabel: "正在执行章节",
    itemKey: "chapter_execution",
  });

  assert.equal(updated.pendingManualRecovery, true);
  assert.equal(Object.hasOwn(updates[0], "pendingManualRecovery"), false);
});

test("clearing manual recovery requires a command id and preserves its transaction", async () => {
  const updates = [];
  const transaction = { name: "caller transaction" };
  const writer = new DirectorTaskStateWriter({
    async updateTaskManyWithRetry(args, tx) {
      updates.push({ args, tx });
      return { count: 1 };
    },
  });

  assert.throws(() => writer.clearPendingManualRecovery({ where: { id: "task-1" } }), /user command id/);
  assert.throws(() => writer.updateRunState({ where: { id: "task-1" }, data: { pendingManualRecovery: false } }), /clearPendingManualRecovery/);
  assert.throws(
    () => writer.updateRunState({ where: { id: "task-1" }, data: { pendingManualRecovery: { set: false } } }, { many: true }),
    /clearPendingManualRecovery/,
  );

  await writer.clearPendingManualRecovery({ userCommandId: "command-1", where: { id: "task-1" } }, { transaction });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].args.data.pendingManualRecovery, false);
  assert.equal(updates[0].tx, transaction);
});
