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

test("run state updates cannot change the immutable launch contract", async () => {
  const currentState = {
    directorInput: { idea: "原始创意", runMode: "auto_to_ready" },
    runMode: "auto_to_ready",
    provider: "openai",
    model: "gpt-original",
    temperature: 0.2,
    directorSession: { phase: "story_macro" },
  };
  const workflow = {
    async getTaskById() {
      return { id: "task-1", lane: "auto_director", seedPayloadJson: JSON.stringify(currentState) };
    },
    async bootstrapTask(input) {
      return input;
    },
  };
  const writer = new DirectorTaskStateWriter(workflow);

  await assert.rejects(
    writer.initializeTask({
      workflowTaskId: "task-1",
      lane: "auto_director",
      title: "原始创意",
      directorState: {
        launch: {
          directorInput: { idea: "被改写的创意", runMode: "auto_to_ready" },
          runMode: "auto_to_ready",
          provider: "openai",
          model: "gpt-original",
          temperature: 0.2,
        },
        run: { directorSession: { phase: "story_macro" } },
      },
    }),
    /launch contract/i,
  );
});

test("updateDirectorRunState persists run data while preserving launch fields", async () => {
  const existing = {
    id: "task-run-patch",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      idea: "保持启动创意",
      runMode: "full_book_autopilot",
      model: "gpt-launch",
      autoExecution: { nextChapterId: "chapter-1" },
    }),
    resumeTargetJson: null,
  };
  const updates = [];
  const workflow = {
    async getTaskById() { return existing; },
    async updateTaskWithRetry(args) {
      updates.push(args);
      return args;
    },
  };
  const writer = new DirectorTaskStateWriter(workflow);

  await writer.updateDirectorRunState("task-run-patch", {
    autoExecution: { nextChapterId: "chapter-2" },
    llmOverride: { model: "gpt-run-override" },
    stepCalibration: { action: "regenerate", stepId: "story_macro" },
  });

  assert.equal(updates.length, 1);
  const persisted = JSON.parse(updates[0].data.seedPayloadJson);
  assert.equal(persisted.idea, "保持启动创意");
  assert.equal(persisted.runMode, "full_book_autopilot");
  assert.equal(persisted.model, "gpt-launch");
  assert.equal(persisted.autoExecution.nextChapterId, "chapter-2");
  assert.equal(persisted.llmOverride.model, "gpt-run-override");
  assert.equal(persisted.stepCalibration.action, "regenerate");
  await assert.rejects(
    () => writer.updateDirectorRunState("task-run-patch", { directorRuntime: { status: "running" } }),
    /cannot update directorRuntime/,
  );
});

test("updateDirectorRunStateMany keeps the caller filter and transaction while serializing run fields", async () => {
  const existing = {
    id: "task-run-many",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({ runMode: "stage_review", productionExperience: null }),
  };
  const calls = [];
  const transaction = { name: "selection transaction" };
  const writer = new DirectorTaskStateWriter({
    async getTaskById() { return existing; },
    async updateTaskManyWithRetry(args, tx) {
      calls.push({ args, tx });
      return { count: 1 };
    },
  });

  const result = await writer.updateDirectorRunStateMany({
    where: { id: "task-run-many", checkpointType: "production_experience_required" },
    data: { status: "waiting_approval" },
  }, { productionExperience: "professional" }, { transaction });

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(calls[0].args.where, { id: "task-run-many", checkpointType: "production_experience_required" });
  assert.equal(calls[0].args.data.status, "waiting_approval");
  assert.equal(JSON.parse(calls[0].args.data.seedPayloadJson).productionExperience, "professional");
  assert.equal(calls[0].tx, transaction);
});

test("updateDirectorRunStateFromTaskData keeps the launch contract fixed", async () => {
  const existing = {
    id: "task-flat-update",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      directorInput: { idea: "启动创意", runMode: "auto_to_ready" },
      runMode: "auto_to_ready",
      model: "gpt-launch",
    }),
  };
  const updates = [];
  const writer = new DirectorTaskStateWriter({
    async getTaskById() { return existing; },
    async updateTaskWithRetry(args) { updates.push(args); return args; },
  });

  await writer.updateDirectorRunStateFromTaskData("task-flat-update", {
    directorInput: { idea: "运行时变更", runMode: "full_book_autopilot" },
    runMode: "full_book_autopilot",
    model: "gpt-launch",
    autoExecution: { nextChapterId: "chapter-8" },
    resumeTarget: { stage: "pipeline", chapterId: "chapter-8" },
  });
  assert.equal(updates.length, 1);
  const persisted = JSON.parse(updates[0].data.seedPayloadJson);
  assert.equal(persisted.runMode, "auto_to_ready");
  assert.equal(persisted.model, "gpt-launch");
  assert.equal(persisted.directorInput.idea, "启动创意");
  assert.equal(persisted.directorInput.runMode, "auto_to_ready");
  assert.equal(persisted.autoExecution.nextChapterId, "chapter-8");
  assert.equal(updates[0].data.resumeTargetJson, JSON.stringify({ stage: "pipeline", chapterId: "chapter-8" }));
});

test("run updates ignore the deprecated director runtime snapshot", async () => {
  const existing = {
    id: "task-legacy-runtime",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      runMode: "auto_to_ready",
      directorRuntime: { status: "running", currentStep: "legacy-step" },
    }),
  };
  const updates = [];
  const writer = new DirectorTaskStateWriter({
    async getTaskById() { return existing; },
    async updateTaskWithRetry(args) { updates.push(args); return args; },
  });

  await writer.updateDirectorRunStateFromTaskData("task-legacy-runtime", {
    runMode: "auto_to_ready",
    directorRuntime: { status: "running", currentStep: "legacy-step" },
    directorSession: { phase: "chapter_execution" },
  });

  assert.equal(updates.length, 1);
  const persisted = JSON.parse(updates[0].data.seedPayloadJson);
  assert.equal(persisted.directorRuntime, undefined);
  assert.equal(persisted.runMode, "auto_to_ready");
  assert.deepEqual(persisted.directorSession, { phase: "chapter_execution" });
});
