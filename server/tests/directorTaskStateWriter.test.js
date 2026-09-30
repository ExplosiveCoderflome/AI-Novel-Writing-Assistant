const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("node:module");
const originalLoad = Module._load;
let DirectorTaskStateWriter;
let NovelWorkflowService;
let NovelWorkflowApplicationService;
try {
  // Intercept before importing the service graph: these are memory-only tests.
  Module._load = function (request, parent, isMain) {
    if (/[\\/]db[\\/]prisma(?:\.js)?$/.test(request)) return { prisma: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ DirectorTaskStateWriter } = require("../dist/services/novel/director/state/index.js"));
  ({ NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js"));
  ({ NovelWorkflowApplicationService } = require("../dist/services/novel/workflow/NovelWorkflowApplicationService.js"));
} finally {
  Module._load = originalLoad;
}

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

for (const pendingManualRecovery of [false, { set: false }]) {
  for (const entrypoint of ["updateRunState", "updateRunStateMany", "updateDirectorRunState", "updateDirectorRunStateMany", "updateDirectorRunStateFromTaskData"]) {
    test(`${entrypoint} rejects manual recovery clear ${JSON.stringify(pendingManualRecovery)} before persistence`, async () => {
      const writes = [];
      const writer = new DirectorTaskStateWriter({
        async getTaskById() {
          return { id: "task-locked", lane: "auto_director", pendingManualRecovery: true, seedPayloadJson: "{}" };
        },
        async updateTaskWithRetry(args) { writes.push(args); return args; },
        async updateTaskManyWithRetry(args) { writes.push(args); return { count: 1 }; },
      });
      const data = { pendingManualRecovery };
      await assert.rejects(async () => {
        if (entrypoint === "updateRunState") return writer.updateRunState({ where: { id: "task-locked" }, data });
        if (entrypoint === "updateRunStateMany") return writer.updateRunState({ where: { id: "task-locked" }, data }, { many: true });
        if (entrypoint === "updateDirectorRunStateMany") return writer.updateDirectorRunStateMany({ where: { id: "task-locked" }, data }, {});
        return writer[entrypoint]("task-locked", { directorSession: { phase: "chapter_execution" } }, data);
      }, /clearPendingManualRecovery/);
      assert.deepEqual(writes, []);
    });
  }
}

for (const scenario of [
  { name: "omitted", patch: {}, expected: { route: "/novels/novel-1/edit", chapterId: "saved-chapter" }, writesColumn: false },
  { name: "explicit null", patch: { resumeTarget: null }, expected: null, writesColumn: true },
  { name: "object", patch: { resumeTarget: { route: "/novels/novel-1/edit", chapterId: "next-chapter" } }, expected: { route: "/novels/novel-1/edit", chapterId: "next-chapter" }, writesColumn: true },
]) {
  test(`flat run update respects ${scenario.name} resume target`, async () => {
    let task = {
      id: "task-resume", lane: "auto_director", seedPayloadJson: JSON.stringify({ runMode: "auto_to_ready" }),
      resumeTargetJson: JSON.stringify({ route: "/novels/novel-1/edit", chapterId: "saved-chapter" }),
    };
    const writes = [];
    const writer = new DirectorTaskStateWriter({
      async getTaskById() { return task; },
      async updateTaskWithRetry({ data }) { writes.push(data); task = { ...task, ...data }; return task; },
    });
    await writer.updateDirectorRunStateFromTaskData(task.id, { directorSession: { phase: "chapter_execution" }, ...scenario.patch });
    assert.deepEqual(JSON.parse(task.resumeTargetJson), scenario.expected);
    assert.equal(Object.hasOwn(writes[0], "resumeTargetJson"), scenario.writesColumn);
    assert.equal(Object.hasOwn(JSON.parse(task.seedPayloadJson), "resumeTarget"), false);
  });
}

test("candidate checkpoint and retry use workflow transitions and preserve the manual lock", async () => {
  let task = {
    id: "task-candidate", lane: "auto_director", novelId: null, status: "running", progress: 0.1,
    checkpointType: null, pendingManualRecovery: true, cancelRequestedAt: null, attemptCount: 2,
    seedPayloadJson: JSON.stringify({ idea: "候选创意" }), milestonesJson: "[]",
  };
  const workflow = new NovelWorkflowService();
  workflow.getTaskById = async () => task;
  workflow.updateWorkflowTaskWithNotifications = async ({ data }) => (task = { ...task, ...data });
  const writer = new DirectorTaskStateWriter(workflow);
  await writer.markCandidateSelectionRequired(task.id, { summary: "请选择故事方向", seedPayload: { batches: [{ id: "batch-1" }] } });
  assert.equal(task.status, "waiting_approval");
  assert.equal(task.checkpointType, "candidate_selection_required");
  assert.deepEqual(JSON.parse(task.seedPayloadJson).batches, [{ id: "batch-1" }]);
  assert.equal(JSON.parse(task.seedPayloadJson).idea, "候选创意");
  assert.equal(task.pendingManualRecovery, true);
  await writer.retryTask(task.id);
  assert.equal(task.attemptCount, 3);
  assert.equal(task.status, "waiting_approval");
  assert.equal(task.pendingManualRecovery, true);
});

test("model retry override updates run state while preserving the launch contract", async () => {
  let task = {
    id: "task-model", lane: "auto_director", novelId: "novel-1",
    seedPayloadJson: JSON.stringify({
      directorInput: { idea: "创意", provider: "deepseek", model: "original-model", temperature: 0.7 },
      provider: "deepseek", model: "original-model", temperature: 0.7,
    }),
  };
  const initialLaunch = JSON.parse(task.seedPayloadJson);
  const workflow = {
    async getTaskById() { return task; },
    async updateTaskWithRetry({ data }) { task = { ...task, ...data }; return task; },
  };
  const application = new NovelWorkflowApplicationService(workflow);
  await application.applyAutoDirectorLlmOverride(task.id, { model: "retry-model", temperature: 0.3 });

  const saved = JSON.parse(task.seedPayloadJson);
  assert.equal(saved.model, initialLaunch.model);
  assert.deepEqual(saved.directorInput, initialLaunch.directorInput);
  assert.deepEqual(saved.llmOverride, { model: "retry-model", temperature: 0.3 });
});
