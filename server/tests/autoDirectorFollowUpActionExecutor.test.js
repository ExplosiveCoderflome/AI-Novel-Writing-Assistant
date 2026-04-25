const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { AutoDirectorFollowUpActionExecutor } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");
const { prisma } = require("../dist/db/prisma.js");

function buildWorkflowRow(overrides = {}) {
  return {
    id: "task_default",
    novelId: "novel_default",
    lane: "auto_director",
    title: "AI 自动导演",
    status: "waiting_approval",
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "等待继续自动执行",
    checkpointType: "front10_ready",
    checkpointSummary: "前 10 章已准备完成。",
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      temperature: 0.4,
      novelId: "novel_default",
      directorInput: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        temperature: 0.4,
        runMode: "auto_to_execution",
        candidate: {
          workingTitle: "雾港巡夜人",
        },
      },
      autoExecution: {
        scopeLabel: "前 10 章",
      },
    }),
    milestonesJson: "[]",
    pendingManualRecovery: false,
    attemptCount: 1,
    lastError: null,
    finishedAt: null,
    updatedAt: new Date("2026-04-22T08:00:00.000Z"),
    ...overrides,
  };
}

function buildTaskDetail(taskId, overrides = {}) {
  return {
    id: taskId,
    kind: "novel_workflow",
    title: "AI 自动导演",
    status: "running",
    progress: 0.93,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "正在恢复当前章节批次",
    executionScopeLabel: "前 10 章",
    displayStatus: "正在恢复当前章节批次",
    blockingReason: null,
    resumeAction: "继续自动执行前 10 章",
    lastHealthyStage: "章节执行",
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: "2026-04-22T07:00:00.000Z",
    updatedAt: "2026-04-22T08:05:00.000Z",
    heartbeatAt: "2026-04-22T08:05:00.000Z",
    ownerId: "novel_default",
    ownerLabel: "《雾港巡夜人》",
    sourceRoute: "/novels/novel_default/edit",
    checkpointType: null,
    checkpointSummary: null,
    resumeTarget: null,
    nextActionLabel: "继续自动执行前 10 章",
    noticeCode: null,
    noticeSummary: null,
    failureCode: null,
    failureSummary: null,
    recoveryHint: null,
    tokenUsage: null,
    sourceResource: null,
    targetResources: [],
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    startedAt: "2026-04-22T07:00:00.000Z",
    finishedAt: null,
    retryCountLabel: "1/3",
    meta: {},
    steps: [],
    failureDetails: null,
    ...overrides,
  };
}

test("auto director follow-up action executor continues auto execution and deduplicates repeated idempotency keys", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const calls = [];
  const originals = {
    actionLogFindUnique: prisma.autoDirectorFollowUpActionLog.findUnique,
    actionLogCreate: prisma.autoDirectorFollowUpActionLog.create,
  };
  const actionLogs = new Map();

  prisma.autoDirectorFollowUpActionLog.findUnique = async ({ where }) => actionLogs.get(where.idempotencyKey) ?? null;
  prisma.autoDirectorFollowUpActionLog.create = async ({ data }) => {
    actionLogs.set(data.idempotencyKey, {
      ...data,
      executedAt: data.executedAt ?? new Date(),
    });
    return actionLogs.get(data.idempotencyKey);
  };
  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => buildWorkflowRow({
    id: "task_front10",
    checkpointType: "front10_ready",
  });
  executor.novelDirectorService.continueTask = async (taskId, input) => {
    calls.push({ taskId, input });
  };
  executor.workflowTaskAdapter.detail = async (taskId) => buildTaskDetail(taskId);

  const first = await executor.execute({
    taskId: "task_front10",
    actionCode: "continue_auto_execution",
    source: "web",
    operatorId: "user_1",
    idempotencyKey: "continue-front10-k1",
  });

  const second = await executor.execute({
    taskId: "task_front10",
    actionCode: "continue_auto_execution",
    source: "web",
    operatorId: "user_1",
    idempotencyKey: "continue-front10-k1",
  });

  assert.equal(first.code, "executed");
  assert.equal(first.taskId, "task_front10");
  assert.equal(first.task.id, "task_front10");
  assert.deepEqual(calls, [{
    taskId: "task_front10",
    input: {
      continuationMode: "auto_execute_front10",
    },
  }]);
  assert.equal(actionLogs.get("continue-front10-k1").resultCode, "executed");
  assert.equal(second.code, "already_processed");
  assert.equal(second.task.id, "task_front10");
  assert.equal(actionLogs.size, 1);

  prisma.autoDirectorFollowUpActionLog.findUnique = originals.actionLogFindUnique;
  prisma.autoDirectorFollowUpActionLog.create = originals.actionLogCreate;
});

test("auto director follow-up action executor retries with the route model and resumes execution", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const calls = [];
  const originals = {
    actionLogFindUnique: prisma.autoDirectorFollowUpActionLog.findUnique,
    actionLogCreate: prisma.autoDirectorFollowUpActionLog.create,
  };
  const actionLogs = new Map();

  prisma.autoDirectorFollowUpActionLog.findUnique = async ({ where }) => actionLogs.get(where.idempotencyKey) ?? null;
  prisma.autoDirectorFollowUpActionLog.create = async ({ data }) => {
    actionLogs.set(data.idempotencyKey, {
      ...data,
      executedAt: data.executedAt ?? new Date(),
    });
    return actionLogs.get(data.idempotencyKey);
  };
  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => buildWorkflowRow({
    id: "task_retry_route",
    status: "failed",
    checkpointType: "chapter_batch_ready",
    lastError: "模型调用失败",
  });
  executor.resolveRouteModelOverride = async () => ({
    provider: "openai",
    model: "gpt-5.4",
    temperature: 0.2,
  });
  executor.workflowTaskAdapter.retry = async (input) => {
    calls.push(input);
    return buildTaskDetail(input.id, {
      status: "running",
      provider: "openai",
      model: "gpt-5.4",
    });
  };
  executor.workflowTaskAdapter.detail = async (taskId) => buildTaskDetail(taskId, {
    status: "running",
    provider: "openai",
    model: "gpt-5.4",
  });

  const result = await executor.execute({
    taskId: "task_retry_route",
    actionCode: "retry_with_route_model",
    source: "web",
    operatorId: "user_2",
    idempotencyKey: "retry-route-k1",
  });

  assert.equal(result.code, "executed");
  assert.deepEqual(calls, [{
    id: "task_retry_route",
    llmOverride: {
      provider: "openai",
      model: "gpt-5.4",
      temperature: 0.2,
    },
    resume: true,
  }]);
  assert.equal(result.task.provider, "openai");
  assert.equal(result.task.model, "gpt-5.4");
  assert.equal(actionLogs.get("retry-route-k1").resultCode, "executed");

  prisma.autoDirectorFollowUpActionLog.findUnique = originals.actionLogFindUnique;
  prisma.autoDirectorFollowUpActionLog.create = originals.actionLogCreate;
});

test("auto director follow-up action executor returns forbidden when the action is not allowed for the current reason", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const originals = {
    actionLogFindUnique: prisma.autoDirectorFollowUpActionLog.findUnique,
    actionLogCreate: prisma.autoDirectorFollowUpActionLog.create,
  };

  prisma.autoDirectorFollowUpActionLog.findUnique = async () => null;
  prisma.autoDirectorFollowUpActionLog.create = async () => null;

  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => buildWorkflowRow({
    id: "task_candidate",
    checkpointType: "candidate_selection_required",
    currentStage: "AI 自动导演",
    currentItemKey: "auto_director",
    currentItemLabel: "等待确认书级方向",
  });
  executor.workflowTaskAdapter.detail = async (taskId) => buildTaskDetail(taskId, {
    status: "waiting_approval",
    currentStage: "AI 自动导演",
    currentItemKey: "auto_director",
    currentItemLabel: "等待确认书级方向",
    checkpointType: "candidate_selection_required",
    checkpointSummary: "请先确认书级方向。",
  });

  const result = await executor.execute({
    taskId: "task_candidate",
    actionCode: "retry_with_task_model",
    source: "web",
    operatorId: "user_3",
    idempotencyKey: "forbidden-k1",
  });

  assert.equal(result.code, "forbidden");
  assert.equal(result.taskId, "task_candidate");
  assert.match(result.message, /当前任务不支持该操作|不支持/);

  prisma.autoDirectorFollowUpActionLog.findUnique = originals.actionLogFindUnique;
  prisma.autoDirectorFollowUpActionLog.create = originals.actionLogCreate;
});

test("auto director follow-up action executor returns state_changed when the follow-up is no longer actionable", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const originals = {
    actionLogFindUnique: prisma.autoDirectorFollowUpActionLog.findUnique,
    actionLogCreate: prisma.autoDirectorFollowUpActionLog.create,
  };

  prisma.autoDirectorFollowUpActionLog.findUnique = async () => null;
  prisma.autoDirectorFollowUpActionLog.create = async () => null;

  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async () => buildWorkflowRow({
    id: "task_done",
    status: "succeeded",
    checkpointType: "workflow_completed",
    currentItemLabel: "任务已完成",
    finishedAt: new Date("2026-04-22T08:10:00.000Z"),
  });
  executor.workflowTaskAdapter.detail = async (taskId) => buildTaskDetail(taskId, {
    status: "succeeded",
    currentItemLabel: "任务已完成",
    checkpointType: "workflow_completed",
    finishedAt: "2026-04-22T08:10:00.000Z",
  });

  const result = await executor.execute({
    taskId: "task_done",
    actionCode: "continue_generic",
    source: "web",
    operatorId: "user_4",
    idempotencyKey: "state-changed-k1",
  });

  assert.equal(result.code, "state_changed");
  assert.equal(result.task.status, "succeeded");

  prisma.autoDirectorFollowUpActionLog.findUnique = originals.actionLogFindUnique;
  prisma.autoDirectorFollowUpActionLog.create = originals.actionLogCreate;
});

test("auto director follow-up action executor batches per-task results without all-or-nothing failure", async () => {
  const executor = new AutoDirectorFollowUpActionExecutor();
  const retryCalls = [];
  const originals = {
    actionLogFindUnique: prisma.autoDirectorFollowUpActionLog.findUnique,
    actionLogCreate: prisma.autoDirectorFollowUpActionLog.create,
  };
  const actionLogs = new Map();

  prisma.autoDirectorFollowUpActionLog.findUnique = async ({ where }) => actionLogs.get(where.idempotencyKey) ?? null;
  prisma.autoDirectorFollowUpActionLog.create = async ({ data }) => {
    actionLogs.set(data.idempotencyKey, {
      ...data,
      executedAt: data.executedAt ?? new Date(),
    });
    return actionLogs.get(data.idempotencyKey);
  };
  executor.workflowService.healAutoDirectorTaskState = async () => false;
  executor.workflowService.getTaskByIdWithoutHealing = async (taskId) => {
    if (taskId === "task_ok") {
      return buildWorkflowRow({
        id: taskId,
        status: "failed",
        checkpointType: "chapter_batch_ready",
      });
    }
    if (taskId === "task_skip") {
      return buildWorkflowRow({
        id: taskId,
        checkpointType: "replan_required",
      });
    }
    return buildWorkflowRow({
      id: taskId,
      status: "failed",
      checkpointType: "chapter_batch_ready",
    });
  };
  executor.workflowTaskAdapter.retry = async (input) => {
    if (input.id === "task_fail") {
      throw new Error("retry exploded");
    }
    retryCalls.push(input);
    return buildTaskDetail(input.id);
  };
  executor.workflowTaskAdapter.detail = async (taskId) => buildTaskDetail(taskId, {
    status: taskId === "task_skip" ? "waiting_approval" : "running",
    checkpointType: taskId === "task_skip" ? "replan_required" : null,
  });

  const result = await executor.executeBatch({
    actionCode: "retry_with_task_model",
    taskIds: ["task_ok", "task_skip", "task_fail"],
    source: "web",
    operatorId: "user_5",
    batchRequestKey: "batch-retry-k1",
  });

  assert.equal(result.code, "partial_success");
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(retryCalls, [{
    id: "task_ok",
    resume: true,
  }]);
  assert.deepEqual(result.itemResults.map((item) => [item.taskId, item.code]), [
    ["task_ok", "executed"],
    ["task_skip", "forbidden"],
    ["task_fail", "failed"],
  ]);

  prisma.autoDirectorFollowUpActionLog.findUnique = originals.actionLogFindUnique;
  prisma.autoDirectorFollowUpActionLog.create = originals.actionLogCreate;
});
