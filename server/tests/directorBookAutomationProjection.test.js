const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  DirectorBookAutomationProjectionService,
} = require("../dist/services/novel/director/DirectorBookAutomationProjectionService.js");
const {
  directorArtifactLedgerQueryService,
} = require("../dist/services/novel/director/runtime/DirectorArtifactLedgerQueryService.js");
const {
  directorUsageTelemetryQueryService,
} = require("../dist/services/novel/director/runtime/DirectorUsageTelemetryQueryService.js");

function createHarness(overrides = {}) {
  const latestTask = {
    id: "task-1",
    title: "AI 自动导演",
    status: "running",
    progress: 40,
    currentStage: "structured_outline",
    currentItemKey: "chapter_list",
    currentItemLabel: "生成章节任务单",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "章节任务单准备中。",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      runMode: "full_book_autopilot",
    }),
    updatedAt: new Date("2026-04-30T09:00:00.000Z"),
    ...overrides.latestTask,
  };
  const latestRun = {
    id: "run-1",
    taskId: "task-1",
    policyJson: JSON.stringify({ mode: "auto_safe_scope" }),
    updatedAt: new Date("2026-04-30T09:00:01.000Z"),
    ...overrides.latestRun,
  };
  const commands = overrides.commands ?? [
    {
      id: "command-1",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "continue",
      status: "running",
      errorMessage: null,
      leaseOwner: "worker-1",
      leaseExpiresAt: new Date("2099-04-30T09:02:00.000Z"),
      runAfter: new Date("2026-04-30T08:59:00.000Z"),
      createdAt: new Date("2026-04-30T08:59:00.000Z"),
      updatedAt: new Date("2026-04-30T09:00:02.000Z"),
      startedAt: new Date("2026-04-30T08:59:30.000Z"),
      finishedAt: null,
    },
  ];
  const events = overrides.events ?? [
    {
      id: "event-1",
      runId: "run-1",
      taskId: "task-1",
      novelId: "novel-1",
      type: "node_heartbeat",
      nodeKey: "structured_outline.chapter_list",
      artifactType: null,
      summary: "正在生成章节任务单。",
      affectedScope: "novel:novel-1",
      severity: "low",
      occurredAt: new Date("2026-04-30T09:00:03.000Z"),
    },
  ];
  const steps = overrides.steps ?? [
    {
      idempotencyKey: "task-1:structured_outline.chapter_list:novel:novel-1",
      runId: "run-1",
      taskId: "task-1",
      novelId: "novel-1",
      nodeKey: "structured_outline.chapter_list",
      label: "生成章节任务单",
      status: "running",
      error: null,
      startedAt: new Date("2026-04-30T08:59:00.000Z"),
      finishedAt: null,
      updatedAt: new Date("2026-04-30T09:00:02.000Z"),
    },
  ];
  const approvals = overrides.approvals ?? [
    {
      id: "approval-1",
      taskId: "task-1",
      approvalPointLabel: "章节执行继续",
      checkpointSummary: "AI 自动继续章节生成。",
      summary: "AI 自动确认章节执行继续。",
      stage: "chapter_execution",
      scopeLabel: "全书",
      createdAt: new Date("2026-04-30T08:58:00.000Z"),
    },
  ];
  const counts = {
    active: 5,
    stale: 1,
    protected: 2,
    repair: 1,
    ...overrides.counts,
  };
  const artifactSummary = overrides.artifactSummary ?? {
    activeCount: counts.active,
    staleCount: counts.stale,
    protectedUserContentCount: counts.protected,
    repairTicketCount: counts.repair,
  };
  const usageTelemetry = overrides.usageTelemetry ?? {
    summary: null,
    recentUsage: [],
    stepUsage: [],
  };
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    taskFindFirst: prisma.novelWorkflowTask.findFirst,
    runFindFirst: prisma.directorRun.findFirst,
    commandFindMany: prisma.directorRunCommand.findMany,
    eventFindMany: prisma.directorEvent.findMany,
    stepFindMany: prisma.directorStepRun.findMany,
    approvalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    artifactGetBookSummary: directorArtifactLedgerQueryService.getBookSummary,
    usageGetBookUsage: directorUsageTelemetryQueryService.getBookUsage,
  };

  prisma.novel.findUnique = async ({ where }) => {
    assert.equal(where.id, "novel-1");
    return overrides.novel ?? {
      id: "novel-1",
      title: "测试小说",
    };
  };
  prisma.novelWorkflowTask.findFirst = async ({ where }) => {
    assert.equal(where.novelId, "novel-1");
    assert.equal(where.lane, "auto_director");
    return latestTask;
  };
  prisma.directorRun.findFirst = async ({ where }) => {
    assert.equal(where.novelId, "novel-1");
    return latestRun;
  };
  prisma.directorRunCommand.findMany = async ({ where }) => {
    assert.deepEqual(where.OR, [
      { novelId: "novel-1" },
      { taskId: { in: ["task-1"] } },
    ]);
    return commands;
  };
  prisma.directorEvent.findMany = async () => events;
  prisma.directorStepRun.findMany = async () => steps;
  prisma.autoDirectorAutoApprovalRecord.findMany = async ({ where }) => {
    assert.equal(where.novelId, "novel-1");
    return approvals;
  };
  directorArtifactLedgerQueryService.getBookSummary = async (novelId) => {
    assert.equal(novelId, "novel-1");
    return artifactSummary;
  };
  directorUsageTelemetryQueryService.getBookUsage = async (input) => {
    assert.equal(input.novelId, "novel-1");
    assert.deepEqual(input.taskIds, ["task-1"]);
    return usageTelemetry;
  };

  return {
    service: new DirectorBookAutomationProjectionService(async () => (
      Object.prototype.hasOwnProperty.call(overrides, "runtimeProjection")
        ? overrides.runtimeProjection
        : {
      runId: "run-1",
      novelId: "novel-1",
      status: "running",
      currentNodeKey: "structured_outline.chapter_list",
      currentLabel: "生成章节任务单",
      headline: "推进任务：生成章节任务单",
      detail: "最近进展：正在生成章节任务单。",
      lastEventSummary: "正在生成章节任务单。",
      requiresUserAction: false,
      blockedReason: null,
      nextActionLabel: "继续章节生成",
      progressSummary: "进展：3/8 个步骤完成，5 个产物记录。",
      policyMode: "auto_safe_scope",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
        }
    )),
    restore() {
      prisma.novel.findUnique = originals.novelFindUnique;
      prisma.novelWorkflowTask.findFirst = originals.taskFindFirst;
      prisma.directorRun.findFirst = originals.runFindFirst;
      prisma.directorRunCommand.findMany = originals.commandFindMany;
      prisma.directorEvent.findMany = originals.eventFindMany;
      prisma.directorStepRun.findMany = originals.stepFindMany;
      prisma.autoDirectorAutoApprovalRecord.findMany = originals.approvalFindMany;
      directorArtifactLedgerQueryService.getBookSummary = originals.artifactGetBookSummary;
      directorUsageTelemetryQueryService.getBookUsage = originals.usageGetBookUsage;
    },
  };
}

test("book automation projection aggregates task, command, event, approval and artifact state by novel", async () => {
  const harness = createHarness();
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.novelId, "novel-1");
    assert.equal(projection.focusNovel.title, "测试小说");
    assert.equal(projection.displayState, "processing");
    assert.equal(projection.userHeadline, "AI 正在处理：生成章节任务单");
    assert.equal(projection.latestTask.id, "task-1");
    assert.equal(projection.latestRunId, "run-1");
    assert.equal(projection.status, "running");
    assert.equal(projection.runMode, "full_book_autopilot");
    assert.equal(projection.policyMode, "auto_safe_scope");
    assert.equal(projection.headline, "推进任务：生成章节任务单");
    assert.equal(projection.activeCommandCount, 1);
    assert.equal(projection.pendingCommandCount, 0);
    assert.equal(projection.workerHealth.derivedState, "running_step");
    assert.equal(projection.workerHealth.currentWorkerId, "worker-1");
    assert.equal(projection.autoApprovalRecordCount, 1);
    assert.deepEqual(projection.artifactSummary, {
      activeCount: 5,
      staleCount: 1,
      protectedUserContentCount: 2,
      repairTicketCount: 1,
    });
    assert.equal(projection.primaryAction.label, "查看推进状态");
    assert.equal(projection.primaryAction.target.href, "/novels/novel-1/edit?directorTaskId=task-1");
    assert.equal(projection.secondaryActions[0].target.href, "/novels/novel-1/edit?directorTaskId=task-1&taskPanel=1");
    assert.equal(projection.timeline[0].id, "event:event-1");
    assert.ok(projection.timeline.some((item) => item.id === "command:command-1"));
    assert.ok(projection.timeline.some((item) => item.id === "approval:approval-1"));
  } finally {
    harness.restore();
  }
});

test("book automation projection explains queued commands waiting for a worker", async () => {
  const harness = createHarness({
    runtimeProjection: null,
    latestTask: {
      pendingManualRecovery: true,
      lastError: "后台执行中断，点击恢复后继续。",
    },
    commands: [
      {
        id: "command-queued",
        taskId: "task-1",
        novelId: "novel-1",
        commandType: "continue",
        status: "queued",
        errorMessage: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        runAfter: new Date("2026-04-30T08:59:00.000Z"),
        createdAt: new Date("2026-04-30T08:58:00.000Z"),
        updatedAt: new Date("2026-04-30T08:59:00.000Z"),
        startedAt: null,
        finishedAt: null,
      },
    ],
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "queued");
    assert.equal(projection.displayState, "processing");
    assert.equal(projection.requiresUserAction, false);
    assert.equal(projection.pendingCommandCount, 1);
    assert.equal(projection.activeCommandCount, 0);
    assert.equal(projection.workerHealth.derivedState, "queued_waiting_worker");
    assert.equal(projection.workerHealth.queuedCommandCount, 1);
    assert.match(projection.detail, /后台执行器接手/);
    assert.match(projection.currentLabel, /后台执行器接手/);
    assert.match(projection.automationSummary, /后台执行器接手/);
  } finally {
    harness.restore();
  }
});

test("book automation projection treats manual recovery as a book-level user action", async () => {
  const harness = createHarness({
    latestTask: {
      status: "running",
      pendingManualRecovery: true,
      lastError: "后台执行中断，点击恢复后继续。",
    },
    commands: [],
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "running",
      headline: "推进任务：生成章节任务单",
      detail: "最近进展：正在生成章节任务单。",
      requiresUserAction: false,
      blockedReason: null,
      policyMode: "auto_safe_scope",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "waiting_recovery");
    assert.equal(projection.displayState, "paused");
    assert.equal(projection.requiresUserAction, true);
    assert.equal(projection.blockedReason, "后台执行中断，点击恢复后继续。");
    assert.equal(projection.headline, "等待恢复自动导演");
    assert.equal(projection.userHeadline, "AI 已暂停在可处理的位置");
    assert.equal(projection.primaryAction.label, "从进度点继续");
    assert.equal(projection.primaryAction.commandPayload.continuationMode, "resume");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps active work ahead of old stale commands", async () => {
  const harness = createHarness({
    runtimeProjection: null,
    commands: [
      {
        id: "command-running",
        taskId: "task-1",
        novelId: "novel-1",
        commandType: "continue",
        status: "running",
        errorMessage: null,
        leaseOwner: "worker-1",
        leaseExpiresAt: new Date("2099-04-30T09:02:00.000Z"),
        runAfter: new Date("2026-04-30T08:59:00.000Z"),
        createdAt: new Date("2026-04-30T08:59:00.000Z"),
        updatedAt: new Date("2026-04-30T09:00:02.000Z"),
        startedAt: new Date("2026-04-30T08:59:30.000Z"),
        finishedAt: null,
      },
      {
        id: "command-stale",
        taskId: "task-1",
        novelId: "novel-1",
        commandType: "continue",
        status: "stale",
        errorMessage: "lease expired",
        leaseOwner: "worker-old",
        leaseExpiresAt: new Date("2026-04-30T08:00:00.000Z"),
        runAfter: new Date("2026-04-30T07:50:00.000Z"),
        createdAt: new Date("2026-04-30T07:50:00.000Z"),
        updatedAt: new Date("2026-04-30T08:00:02.000Z"),
        startedAt: new Date("2026-04-30T07:59:30.000Z"),
        finishedAt: new Date("2026-04-30T08:00:02.000Z"),
      },
    ],
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "running");
    assert.equal(projection.workerHealth.derivedState, "running_step");
    assert.equal(projection.workerHealth.runningCommandCount, 1);
    assert.equal(projection.workerHealth.staleCommandCount, 1);
    assert.equal(projection.workerHealth.currentCommandId, "command-running");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps a running workflow ahead of a completed runtime snapshot", async () => {
  const harness = createHarness({
    commands: [],
    latestTask: {
      status: "running",
      currentStage: "质量修复",
      currentItemKey: "quality_repair",
      currentItemLabel: "正在自动修复第 1-10 章",
      checkpointType: null,
      checkpointSummary: null,
    },
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "completed",
      headline: "步骤完成：生成卷拆章列表",
      detail: "Book contract artifact already exists and can be reused.",
      requiresUserAction: false,
      blockedReason: null,
      nextActionLabel: "继续章节生成",
      policyMode: "run_until_gate",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.latestTask.status, "running");
    assert.equal(projection.status, "running");
    assert.equal(projection.displayState, "processing");
    assert.equal(projection.requiresUserAction, false);
    assert.equal(projection.primaryAction.label, "查看推进状态");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps queued retry workflow ahead of old failed runtime snapshot", async () => {
  const harness = createHarness({
    commands: [],
    latestTask: {
      status: "queued",
      currentStage: "章节执行",
      currentItemKey: "chapter_execution",
      currentItemLabel: "正在自动执行第 3-10 章",
      checkpointType: null,
      checkpointSummary: null,
      lastError: null,
    },
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "failed",
      headline: "处理失败：执行章节生成批次",
      detail: "chapter.draft.write did not satisfy its completion criteria.",
      requiresUserAction: true,
      blockedReason: "chapter.draft.write did not satisfy its completion criteria.",
      nextActionLabel: "继续章节生成",
      policyMode: "run_until_gate",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.latestTask.status, "queued");
    assert.equal(projection.status, "queued");
    assert.equal(projection.displayState, "processing");
    assert.equal(projection.requiresUserAction, false);
    assert.equal(projection.blockedReason, null);
    assert.equal(projection.primaryAction.label, "查看推进状态");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps waiting gates ahead of old stale commands", async () => {
  const harness = createHarness({
    runtimeProjection: null,
    latestTask: {
      status: "waiting_approval",
      currentItemLabel: "waiting gate",
      checkpointSummary: "approval needed",
    },
    commands: [
      {
        id: "command-stale",
        taskId: "task-1",
        novelId: "novel-1",
        commandType: "continue",
        status: "stale",
        errorMessage: "lease expired",
        leaseOwner: "worker-old",
        leaseExpiresAt: new Date("2026-04-30T08:00:00.000Z"),
        runAfter: new Date("2026-04-30T07:50:00.000Z"),
        createdAt: new Date("2026-04-30T07:50:00.000Z"),
        updatedAt: new Date("2026-04-30T08:00:02.000Z"),
        startedAt: new Date("2026-04-30T07:59:30.000Z"),
        finishedAt: new Date("2026-04-30T08:00:02.000Z"),
      },
    ],
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "waiting_approval");
    assert.equal(projection.workerHealth.derivedState, "waiting_gate");
    assert.equal(projection.workerHealth.staleCommandCount, 1);
    assert.equal(projection.currentLabel, "waiting gate");
    assert.equal(projection.detail, "approval needed");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps waiting approval ahead of a stale failed runtime snapshot", async () => {
  const harness = createHarness({
    commands: [],
    latestTask: {
      status: "waiting_approval",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "第 3-10 章已准备好继续执行。",
      currentItemLabel: "等待继续自动执行第 3-10 章",
    },
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "failed",
      headline: "处理失败：执行章节生成批次",
      detail: "stale runtime failure",
      requiresUserAction: true,
      blockedReason: "stale runtime failure",
      nextActionLabel: "继续章节生成",
      policyMode: "run_until_gate",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "waiting_approval");
    assert.equal(projection.displayState, "needs_confirmation");
    assert.equal(projection.requiresUserAction, true);
    assert.equal(projection.detail, "第 3-10 章已准备好继续执行。");
  } finally {
    harness.restore();
  }
});

test("book automation projection prefers the latest task error over stale checkpoint summaries", async () => {
  const harness = createHarness({
    commands: [],
    latestTask: {
      status: "failed",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "[{\"origin\":\"string\",\"code\":\"too_small\"}]",
      lastError: "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。",
    },
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "failed",
      headline: "处理失败：执行章节生成批次",
      detail: null,
      requiresUserAction: true,
      blockedReason: "stale runtime failure",
      nextActionLabel: "继续章节生成",
      policyMode: "run_until_gate",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");
    const taskTimeline = projection.timeline.find((item) => item.id === "task:task-1");

    assert.equal(projection.status, "failed");
    assert.equal(projection.blockedReason, "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。");
    assert.equal(projection.detail, "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。");
    assert.equal(projection.userReason, "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。");
    assert.equal(taskTimeline?.detail, "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。");
  } finally {
    harness.restore();
  }
});

test("book automation projection keeps a failed workflow ahead of a stale waiting-approval runtime snapshot", async () => {
  const harness = createHarness({
    commands: [],
    latestTask: {
      status: "failed",
      checkpointType: null,
      checkpointSummary: "该动作会自动推进较大范围的章节生成，需要确认后才能继续。",
      lastError: "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。",
      currentItemLabel: "正在自动执行第 2-10 章",
    },
    runtimeProjection: {
      runId: "run-1",
      novelId: "novel-1",
      status: "waiting_approval",
      headline: "等待确认：执行章节生成批次",
      detail: "该动作会自动推进较大范围的章节生成，需要确认后才能继续。",
      requiresUserAction: true,
      blockedReason: "该动作会自动推进较大范围的章节生成，需要确认后才能继续。",
      nextActionLabel: "确认后继续",
      policyMode: "run_until_gate",
      updatedAt: "2026-04-30T09:00:03.000Z",
      recentEvents: [],
    },
  });
  try {
    const projection = await harness.service.getProjection("novel-1");

    assert.equal(projection.status, "failed");
    assert.equal(projection.displayState, "needs_attention");
    assert.equal(projection.detail, "指定区间内没有可生成的章节。当前可用章节范围为第 1 章到第 55 章。");
    assert.equal(projection.primaryAction.label, "查看失败原因");
  } finally {
    harness.restore();
  }
});
