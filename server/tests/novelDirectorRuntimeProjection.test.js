const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma");
const {
  loadPersistentDirectorRuntimeProjection,
} = require("../dist/services/novel/director/projections/novelDirectorRuntimeProjection.js");
const {
  directorUsageTelemetryQueryService,
} = require("../dist/services/novel/director/runtime/DirectorUsageTelemetryQueryService.js");

function buildRun() {
  return {
    id: "task-1",
    novelId: null,
    entrypoint: "candidate_generation",
    policyJson: JSON.stringify({
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-05-02T00:00:00.000Z",
    }),
    lastWorkspaceAnalysisJson: null,
    updatedAt: new Date("2026-05-02T15:18:33.000Z"),
    steps: [{
      idempotencyKey: "task-1:candidate_generation:global:global",
      nodeKey: "candidate_generation",
      label: "生成书级候选",
      status: "succeeded",
      targetType: "global",
      targetId: "global",
      startedAt: new Date("2026-05-02T15:17:33.000Z"),
      finishedAt: new Date("2026-05-02T15:18:33.000Z"),
      error: null,
      policyDecisionJson: null,
    }],
    events: [{
      id: "event-1",
      type: "node_completed",
      taskId: "task-1",
      novelId: null,
      nodeKey: "candidate_generation",
      artifactId: null,
      artifactType: null,
      summary: "生成书级候选完成。",
      affectedScope: null,
      severity: null,
      occurredAt: new Date("2026-05-02T15:18:33.000Z"),
      metadataJson: null,
    }],
  };
}

function mockProjectionData(command, options) {
  const { taskStatus = "running" } = options ?? {};
  const originals = {
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    runtimeFindFirst: prisma.directorRuntimeInstance.findFirst,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    getTaskUsage: directorUsageTelemetryQueryService.getTaskUsage,
  };
  prisma.directorRun.findUnique = async ({ where }) => {
    assert.equal(where.taskId, "task-1");
    return buildRun();
  };
  prisma.directorRunCommand.findFirst = async ({ where }) => {
    assert.equal(where.taskId, "task-1");
    assert.deepEqual(where.status.in, ["queued", "leased", "running"]);
    return command;
  };
  prisma.directorRuntimeInstance.findFirst = async () => null;
  prisma.novelWorkflowTask.findUnique = async ({ where }) => {
    assert.equal(where.id, "task-1");
    return { status: taskStatus };
  };
  directorUsageTelemetryQueryService.getTaskUsage = async (taskId) => {
    assert.equal(taskId, "task-1");
    return {
      summary: null,
      recentUsage: [],
      stepUsage: [],
      promptUsage: [],
    };
  };
  return () => {
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorRuntimeInstance.findFirst = originals.runtimeFindFirst;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    directorUsageTelemetryQueryService.getTaskUsage = originals.getTaskUsage;
  };
}

test("runtime projection shows queued candidate confirmation after direction selection", async () => {
  const restore = mockProjectionData({
    id: "command-1",
    commandType: "confirm_candidate",
    status: "queued",
    updatedAt: new Date("2026-05-02T15:18:39.000Z"),
  });
  try {
    const projection = await loadPersistentDirectorRuntimeProjection("task-1");

    assert.equal(projection.status, "running");
    assert.equal(projection.requiresUserAction, false);
    assert.equal(projection.headline, "AI 正在处理书级方向");
    assert.equal(projection.currentLabel, "书级方向提交完成，等待 AI 创建小说项目。");
    assert.equal(projection.detail, "后台执行器接手后，会创建小说并继续后续流程。");
  } finally {
    restore();
  }
});

test("completed projection is not overridden by stale queued command", async () => {
  const restore = mockProjectionData(
    {
      id: "stale-command-1",
      commandType: "continue",
      status: "queued",
      updatedAt: new Date("2026-05-02T14:00:00.000Z"),
    },
    { taskStatus: "succeeded" },
  );
  try {
    const projection = await loadPersistentDirectorRuntimeProjection("task-1");
    assert.equal(projection.status, "completed",
      "completed projection must not be downgraded by stale queued command");
  } finally {
    restore();
  }
});

test("completed projection is not overridden by stale runtime instance", async () => {
  const originals = {
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    runtimeFindFirst: prisma.directorRuntimeInstance.findFirst,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    getTaskUsage: directorUsageTelemetryQueryService.getTaskUsage,
  };

  prisma.directorRun.findUnique = async () => buildRun();
  prisma.directorRunCommand.findFirst = async () => null;
  prisma.directorRuntimeInstance.findFirst = async () => ({
    id: "stale-runtime-1",
    novelId: "novel-1",
    runId: "task-1",
    status: "waiting_worker",
    currentStep: null,
    checkpointVersion: 0,
    workerMessage: null,
    lastErrorMessage: null,
    lastHeartbeatAt: null,
    updatedAt: new Date("2026-05-02T14:00:00.000Z"),
    executions: [],
    checkpoints: [],
    commands: [],
  });
  prisma.novelWorkflowTask.findUnique = async () => ({ status: "succeeded" });
  directorUsageTelemetryQueryService.getTaskUsage = async () => ({
    summary: null,
    recentUsage: [],
    stepUsage: [],
    promptUsage: [],
  });

  try {
    const projection = await loadPersistentDirectorRuntimeProjection("task-1");
    assert.equal(projection.status, "completed",
      "completed projection must not be downgraded by stale runtime instance");
  } finally {
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorRuntimeInstance.findFirst = originals.runtimeFindFirst;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    directorUsageTelemetryQueryService.getTaskUsage = originals.getTaskUsage;
  }
});

test("runtime projection exposes active worker lease details", async () => {
  const originals = {
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    runtimeFindFirst: prisma.directorRuntimeInstance.findFirst,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    getTaskUsage: directorUsageTelemetryQueryService.getTaskUsage,
  };

  prisma.directorRun.findUnique = async () => buildRun();
  prisma.directorRunCommand.findFirst = async () => null;
  prisma.directorRuntimeInstance.findFirst = async () => ({
    id: "runtime-1",
    novelId: "novel-1",
    runId: "task-1",
    status: "running",
    currentStep: "resume_from_checkpoint",
    checkpointVersion: 2,
    workerMessage: "后台执行器正在推进这本书。",
    lastErrorMessage: null,
    lastHeartbeatAt: new Date("2026-05-04T00:01:00.000Z"),
    updatedAt: new Date("2026-05-04T00:01:00.000Z"),
    executions: [{
      id: "execution-1",
      stepType: "resume_from_checkpoint",
      resourceClass: "writer",
      workerId: "worker-a",
      slotId: "slot-2",
      status: "running",
      startedAt: new Date("2026-05-04T00:00:00.000Z"),
      leaseExpiresAt: new Date("2099-05-04T00:02:00.000Z"),
      errorMessage: null,
    }],
    checkpoints: [],
    commands: [{
      id: "runtime-command-1",
      commandType: "continue",
      status: "running",
      leaseOwner: "worker-a:slot-2",
      leaseExpiresAt: new Date("2099-05-04T00:02:00.000Z"),
      errorMessage: null,
      runAfter: new Date("2026-05-04T00:00:00.000Z"),
      startedAt: new Date("2026-05-04T00:00:00.000Z"),
      finishedAt: null,
      createdAt: new Date("2026-05-04T00:00:00.000Z"),
      updatedAt: new Date("2026-05-04T00:01:00.000Z"),
    }],
  });
  prisma.novelWorkflowTask.findUnique = async () => ({ status: "running" });
  directorUsageTelemetryQueryService.getTaskUsage = async () => ({
    summary: null,
    recentUsage: [],
    stepUsage: [],
    promptUsage: [],
  });

  try {
    const projection = await loadPersistentDirectorRuntimeProjection("task-1");

    assert.equal(projection.workerHealth.derivedState, "running_step");
    assert.equal(projection.workerHealth.currentWorkerId, "worker-a");
    assert.equal(projection.workerHealth.currentSlotId, "slot-2");
    assert.equal(projection.workerHealth.currentExecutionId, "execution-1");
    assert.equal(projection.workerHealth.currentExecutionStatus, "running");
    assert.equal(projection.workerHealth.nextAction, "continue_running");
  } finally {
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorRuntimeInstance.findFirst = originals.runtimeFindFirst;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    directorUsageTelemetryQueryService.getTaskUsage = originals.getTaskUsage;
  }
});

test("runtime projection marks expired leased commands as recovering", async () => {
  const originals = {
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    runtimeFindFirst: prisma.directorRuntimeInstance.findFirst,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    getTaskUsage: directorUsageTelemetryQueryService.getTaskUsage,
  };

  prisma.directorRun.findUnique = async () => buildRun();
  prisma.directorRunCommand.findFirst = async () => null;
  prisma.directorRuntimeInstance.findFirst = async () => ({
    id: "runtime-1",
    novelId: "novel-1",
    runId: "task-1",
    status: "waiting_worker",
    currentStep: "resume_from_checkpoint",
    checkpointVersion: 2,
    workerMessage: null,
    lastErrorMessage: "后台执行中断，系统会从最近进度继续。",
    lastHeartbeatAt: new Date("2026-05-03T00:00:00.000Z"),
    updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    executions: [],
    checkpoints: [],
    commands: [{
      id: "runtime-command-1",
      commandType: "continue",
      status: "leased",
      leaseOwner: "dead-worker:slot-1",
      leaseExpiresAt: new Date("2026-05-03T00:00:00.000Z"),
      errorMessage: "后台执行中断，系统会从最近进度继续。",
      runAfter: new Date("2026-05-03T00:00:00.000Z"),
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-05-03T00:00:00.000Z"),
      updatedAt: new Date("2026-05-03T00:00:00.000Z"),
    }],
  });
  prisma.novelWorkflowTask.findUnique = async () => ({ status: "running" });
  directorUsageTelemetryQueryService.getTaskUsage = async () => ({
    summary: null,
    recentUsage: [],
    stepUsage: [],
    promptUsage: [],
  });

  try {
    const projection = await loadPersistentDirectorRuntimeProjection("task-1");

    assert.equal(projection.workerHealth.derivedState, "auto_recovering");
    assert.equal(projection.workerHealth.staleCommandCount, 1);
    assert.equal(projection.workerHealth.currentWorkerId, "dead-worker");
    assert.equal(projection.workerHealth.currentSlotId, "slot-1");
    assert.equal(projection.workerHealth.nextAction, "recover_stale_command");
    assert.equal(projection.workerHealth.blockedReason, "后台执行中断，系统会从最近进度继续。");
  } finally {
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorRuntimeInstance.findFirst = originals.runtimeFindFirst;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    directorUsageTelemetryQueryService.getTaskUsage = originals.getTaskUsage;
  }
});
