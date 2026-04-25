const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { AutoDirectorFollowUpService } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.js");
const { NovelWorkflowTaskAdapter } = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");
const autoDirectorChannelSettingsService = require("../dist/services/settings/AutoDirectorChannelSettingsService.js");
const taskArchive = require("../dist/services/task/taskArchive.js");
const { prisma } = require("../dist/db/prisma.js");

function buildWorkflowRow(overrides = {}) {
  return {
    id: "task_default",
    novelId: "novel_default",
    lane: "auto_director",
    title: "AI 自动导演",
    status: "waiting_approval",
    progress: 0.92,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "第 11-20 章已准备完成",
    checkpointType: "front10_ready",
    checkpointSummary: "第 11-20 章细化已准备完成。",
    resumeTargetJson: JSON.stringify({
      route: "/novels/:id/edit",
      novelId: "novel_default",
      taskId: "task_default",
      stage: "pipeline",
    }),
    seedPayloadJson: JSON.stringify({
      provider: "openai",
      model: "gpt-5.4",
      temperature: 0.7,
      autoExecution: {
        scopeLabel: "第 11-20 章",
      },
    }),
    milestonesJson: JSON.stringify([
      {
        checkpointType: "front10_ready",
        summary: "第 11-20 章细化已准备完成。",
        createdAt: "2026-04-21T09:00:00.000Z",
      },
      {
        checkpointType: "chapter_batch_ready",
        summary: "第 11-20 章批次执行已暂停。",
        createdAt: "2026-04-21T10:00:00.000Z",
      },
    ]),
    pendingManualRecovery: false,
    heartbeatAt: new Date("2026-04-21T10:05:00.000Z"),
    startedAt: new Date("2026-04-21T08:00:00.000Z"),
    finishedAt: null,
    cancelRequestedAt: null,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    promptTokens: 1200,
    completionTokens: 600,
    totalTokens: 1800,
    llmCallCount: 2,
    lastTokenRecordedAt: new Date("2026-04-21T10:05:00.000Z"),
    createdAt: new Date("2026-04-21T08:00:00.000Z"),
    updatedAt: new Date("2026-04-21T10:05:00.000Z"),
    novel: {
      title: "《雾港巡夜人》",
    },
    ...overrides,
  };
}

test("auto director follow-up service overview counts actionable rows by reason", async () => {
  const originals = {
    getArchivedTaskIds: taskArchive.getArchivedTaskIds,
    findMany: prisma.novelWorkflowTask.findMany,
    autoApprovalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };

  taskArchive.getArchivedTaskIds = async () => [];
  prisma.novelWorkflowTask.findMany = async () => ([
    buildWorkflowRow({ id: "task_manual", pendingManualRecovery: true, status: "running", checkpointType: null, seedPayloadJson: null }),
    buildWorkflowRow({ id: "task_failed", status: "failed", checkpointType: "chapter_batch_ready", seedPayloadJson: JSON.stringify({ provider: "openai", model: "gpt-5.4" }) }),
    buildWorkflowRow({ id: "task_candidate", checkpointType: "candidate_selection_required", currentStage: "AI 自动导演", currentItemKey: "auto_director", currentItemLabel: "等待确认书级方向", seedPayloadJson: null }),
    buildWorkflowRow({ id: "task_excluded", checkpointType: "book_contract_ready", currentItemLabel: "Book Contract 已就绪", seedPayloadJson: null }),
  ]);
  prisma.autoDirectorAutoApprovalRecord.findMany = async () => [];
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "https://relay.example.test/dingtalk",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "https://relay.example.test/wecom",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const overview = await service.getOverview();
    assert.deepEqual(overview.countersByReason, {
      manual_recovery_required: 1,
      runtime_failed: 1,
      candidate_selection_required: 1,
      replan_required: 0,
      runtime_cancelled: 0,
      front10_execution_pending: 0,
      quality_repair_pending: 0,
      auto_progress_running: 0,
      auto_approval_completed: 0,
      runtime_replaced: 0,
      validation_required: 0,
    });
    assert.equal(overview.totalCount, 3);
  } finally {
    taskArchive.getArchivedTaskIds = originals.getArchivedTaskIds;
    prisma.novelWorkflowTask.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.autoApprovalFindMany;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service lists recent auto-approved records in auto-progress without mutation actions", async () => {
  const originals = {
    getArchivedTaskIds: taskArchive.getArchivedTaskIds,
    findMany: prisma.novelWorkflowTask.findMany,
    autoApprovalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };

  taskArchive.getArchivedTaskIds = async () => [];
  prisma.novelWorkflowTask.findMany = async () => ([
    buildWorkflowRow({
      id: "task_running",
      novelId: "novel_a",
      status: "running",
      checkpointType: null,
      currentItemLabel: "正在继续拆章",
      updatedAt: new Date("2026-04-21T09:00:00.000Z"),
    }),
  ]);
  prisma.autoDirectorAutoApprovalRecord.findMany = async ({ where, take }) => {
    assert.deepEqual(where, {
      novelId: "novel_a",
    });
    assert.equal(take, 10);
    return [
      {
        id: "auto_approval_1",
        taskId: "task_running",
        novelId: "novel_a",
        approvalPointCode: "character_setup_ready",
        approvalPointLabel: "角色准备通过后继续",
        checkpointType: "character_setup_required",
        checkpointSummary: "角色准备已生成并应用。",
        summary: "AI 已自动通过角色准备，并继续推进。",
        stage: "character_setup",
        scopeLabel: "全书",
        eventId: "task_running:auto_director.auto_approved:2026-04-21T09:30:00.000Z",
        createdAt: new Date("2026-04-21T09:30:00.000Z"),
      },
    ];
  };
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "https://relay.example.test/dingtalk",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const response = await service.list({
      section: "auto_progress",
      page: 1,
      pageSize: 10,
    });

    assert.deepEqual(response.items.map((item) => [item.itemType, item.taskId, item.autoApprovalRecordId ?? null]), [
      ["auto_approval_record", "task_running", "auto_approval_1"],
      ["task", "task_running", null],
    ]);
    const record = response.items[0];
    assert.equal(record.reason, "auto_approval_completed");
    assert.equal(record.section, "auto_progress");
    assert.equal(record.reasonLabel, "最近自动通过");
    assert.equal(record.followUpSummary, "AI 已自动通过角色准备，并继续推进。");
    assert.deepEqual(record.availableActions.map((action) => action.code), ["open_detail"]);
    assert.deepEqual(record.batchActionCodes, []);
    assert.equal(record.supportsBatch, false);
    assert.equal(response.countersBySection.auto_progress, 2);
    assert.equal(response.countersByReason.auto_approval_completed, 1);
  } finally {
    taskArchive.getArchivedTaskIds = originals.getArchivedTaskIds;
    prisma.novelWorkflowTask.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.autoApprovalFindMany;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service lists actionable items with filters, counters, and pagination", async () => {
  const originals = {
    getArchivedTaskIds: taskArchive.getArchivedTaskIds,
    findMany: prisma.novelWorkflowTask.findMany,
    autoApprovalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };
  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
  };

  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = "https://relay.example.test/wecom";

  taskArchive.getArchivedTaskIds = async () => [];
  prisma.novelWorkflowTask.findMany = async ({ where }) => {
    assert.equal(where.lane, "auto_director");
    return [
      buildWorkflowRow({ id: "task_front10", novelId: "novel_a", updatedAt: new Date("2026-04-21T10:05:00.000Z") }),
      buildWorkflowRow({
        id: "task_replan",
        novelId: "novel_b",
        checkpointType: "replan_required",
        currentStage: "质量修复",
        currentItemKey: "quality_repair",
        currentItemLabel: "等待处理重规划",
        checkpointSummary: "第 12 章审计要求调整后续节奏。",
        resumeTargetJson: JSON.stringify({
          route: "/novels/:id/edit",
          novelId: "novel_b",
          taskId: "task_replan",
          stage: "pipeline",
        }),
        seedPayloadJson: JSON.stringify({ provider: "anthropic", model: "claude-sonnet-4-6" }),
        updatedAt: new Date("2026-04-21T11:05:00.000Z"),
      }),
      buildWorkflowRow({
        id: "task_cancelled",
        novelId: "novel_a",
        status: "cancelled",
        checkpointType: "front10_ready",
        currentItemLabel: "第 11-20 章自动执行已取消",
        updatedAt: new Date("2026-04-21T09:05:00.000Z"),
      }),
    ];
  };
  prisma.autoDirectorAutoApprovalRecord.findMany = async () => [];
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "https://relay.example.test/dingtalk",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "https://relay.example.test/wecom",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const response = await service.list({
      reason: "replan_required",
      channelType: "dingtalk",
      page: 1,
      pageSize: 10,
    });

    assert.equal(response.items.length, 1);
    assert.equal(response.items[0].taskId, "task_replan");
    assert.equal(response.items[0].novelTitle, "《雾港巡夜人》");
    assert.equal(response.items[0].currentModel, "anthropic/claude-sonnet-4-6");
    assert.equal(response.items[0].reason, "replan_required");
    assert.equal(response.items[0].followUpSummary, "第 12 章审计要求调整后续节奏。");
    assert.deepEqual(response.items[0].availableActions.map((item) => item.code), ["go_replan", "open_detail"]);
    assert.equal(response.countersByReason.replan_required, 1);
    assert.deepEqual(response.summaryCounters, {
      recoveredToday: 0,
      completedToday: 0,
    });
    assert.deepEqual(response.availableFilters.channelTypes, ["dingtalk", "wecom"]);
    assert.equal(response.pagination.total, 1);
    assert.equal(response.pagination.page, 1);
    assert.equal(response.pagination.pageSize, 10);
  } finally {
    taskArchive.getArchivedTaskIds = originals.getArchivedTaskIds;
    prisma.novelWorkflowTask.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.autoApprovalFindMany;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service returns section-first counts and filters section results", async () => {
  const originals = {
    getArchivedTaskIds: taskArchive.getArchivedTaskIds,
    findMany: prisma.novelWorkflowTask.findMany,
    autoApprovalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };

  taskArchive.getArchivedTaskIds = async () => [];
  prisma.novelWorkflowTask.findMany = async () => ([
    buildWorkflowRow({
      id: "task_pending",
      status: "waiting_approval",
      checkpointType: "front10_ready",
      updatedAt: new Date("2026-04-21T08:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_running",
      status: "running",
      checkpointType: null,
      currentItemLabel: "正在继续拆章",
      updatedAt: new Date("2026-04-21T09:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_exception",
      status: "failed",
      checkpointType: "chapter_batch_ready",
      lastError: "模型调用失败",
      updatedAt: new Date("2026-04-21T10:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_replaced",
      status: "succeeded",
      checkpointType: "workflow_completed",
      currentItemLabel: "任务已由新导演任务接管",
      seedPayloadJson: JSON.stringify({
        replacementTaskId: "task_new",
      }),
      updatedAt: new Date("2026-04-21T11:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_new",
      status: "running",
      checkpointType: null,
      currentItemLabel: "新导演任务正在推进",
      updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_stale_replacement",
      status: "succeeded",
      checkpointType: "workflow_completed",
      currentItemLabel: "任务记录了不存在的替代任务",
      seedPayloadJson: JSON.stringify({
        replacementTaskId: "task_missing",
      }),
      updatedAt: new Date("2026-04-21T07:00:00.000Z"),
    }),
    buildWorkflowRow({
      id: "task_validation",
      status: "waiting_approval",
      checkpointType: "front10_ready",
      currentItemLabel: "等待继续自动执行",
      seedPayloadJson: JSON.stringify({
        autoExecution: {
          scopeLabel: "第 1-10 章",
          startOrder: 1,
          endOrder: 10,
        },
        autoDirectorValidationResult: {
          allowed: false,
          blockingReasons: ["目标范围缺少节奏拆章，需要先重新校验。"],
          warnings: ["继续前请确认章节范围。"],
          requiredActions: [{
            code: "revalidate_assets",
            label: "重新读取任务状态",
            riskLevel: "low",
            safeToAutoFix: true,
          }],
          affectedScope: {
            type: "chapter_range",
            label: "第 1-10 章",
            startOrder: 1,
            endOrder: 10,
          },
          nextAction: "revalidate",
        },
      }),
      updatedAt: new Date("2026-04-21T13:00:00.000Z"),
    }),
  ]);
  prisma.autoDirectorAutoApprovalRecord.findMany = async () => [];
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const all = await service.list({
      page: 1,
      pageSize: 10,
    });

    assert.deepEqual(all.items.map((item) => item.taskId), [
      "task_validation",
      "task_exception",
      "task_pending",
      "task_new",
      "task_running",
      "task_replaced",
    ]);
    assert.deepEqual(all.countersBySection, {
      needs_validation: 1,
      exception: 1,
      pending: 1,
      auto_progress: 2,
      replaced: 1,
    });
    assert.deepEqual(all.availableFilters.sections, ["needs_validation", "exception", "pending", "auto_progress", "replaced"]);
    assert.equal(all.items.find((item) => item.taskId === "task_running").section, "auto_progress");
    assert.equal(all.items.find((item) => item.taskId === "task_running").supportsBatch, false);
    assert.equal(all.items.find((item) => item.taskId === "task_replaced").section, "replaced");
    assert.equal(all.items.find((item) => item.taskId === "task_validation").reason, "validation_required");
    assert.equal(all.items.find((item) => item.taskId === "task_validation").section, "needs_validation");
    assert.equal(all.items.find((item) => item.taskId === "task_validation").supportsBatch, false);
    assert.equal(all.items.find((item) => item.taskId === "task_stale_replacement"), undefined);

    const filtered = await service.list({
      section: "auto_progress",
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(filtered.items.map((item) => item.taskId), ["task_new", "task_running"]);
    assert.equal(filtered.pagination.total, 2);
  } finally {
    taskArchive.getArchivedTaskIds = originals.getArchivedTaskIds;
    prisma.novelWorkflowTask.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.autoApprovalFindMany;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service detail reuses workflow detail and adds follow-up links", async () => {
  const originals = {
    isTaskArchived: taskArchive.isTaskArchived,
    findUnique: prisma.novelWorkflowTask.findUnique,
    notificationLogFindMany: prisma.autoDirectorFollowUpNotificationLog.findMany,
    adapterDetail: NovelWorkflowTaskAdapter.prototype.detail,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };

  taskArchive.isTaskArchived = async () => false;
  prisma.novelWorkflowTask.findUnique = async ({ where }) => {
    assert.equal(where.id, "task_detail");
    return buildWorkflowRow({
      id: "task_detail",
      novelId: "novel_detail",
      checkpointType: "candidate_selection_required",
      currentStage: "AI 自动导演",
      currentItemKey: "auto_director",
      currentItemLabel: "等待确认书级方向",
      checkpointSummary: "请先确认书级方向。",
      resumeTargetJson: JSON.stringify({
        route: "/novels/create",
        taskId: "task_detail",
        mode: "director",
      }),
      seedPayloadJson: JSON.stringify({ provider: "anthropic", model: "claude-sonnet-4-6" }),
      milestonesJson: JSON.stringify([
        {
          checkpointType: "candidate_selection_required",
          summary: "请先确认书级方向。",
          createdAt: "2026-04-21T08:30:00.000Z",
        },
      ]),
    });
  };
  prisma.autoDirectorFollowUpNotificationLog.findMany = async () => ([
    {
      id: "notify_1",
      eventId: "evt_1",
      eventType: "auto_director.approval_required",
      taskId: "task_detail",
      channelType: "dingtalk",
      target: "https://relay.example.test/dingtalk",
      requestPayload: "{}",
      responseBody: "{\"ok\":true}",
      responseStatus: 202,
      attemptCount: 1,
      deliveredAt: new Date("2026-04-22T09:20:00.000Z"),
      status: "delivered",
      createdAt: new Date("2026-04-22T09:20:00.000Z"),
      updatedAt: new Date("2026-04-22T09:20:00.000Z"),
    },
  ]);
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId) {
    return {
      id: taskId,
      kind: "novel_workflow",
      title: "AI 自动导演",
      status: "waiting_approval",
      progress: 0.3,
      currentStage: "AI 自动导演",
      currentItemKey: "auto_director",
      currentItemLabel: "等待确认书级方向",
      executionScopeLabel: null,
      displayStatus: "等待确认书级方向",
      blockingReason: "需要先确认书级方向，自动导演才能继续推进后续主链。",
      resumeAction: "继续确认书级方向",
      lastHealthyStage: "AI 自动导演",
      attemptCount: 1,
      maxAttempts: 3,
      lastError: null,
      createdAt: "2026-04-21T08:00:00.000Z",
      updatedAt: "2026-04-21T08:30:00.000Z",
      heartbeatAt: "2026-04-21T08:30:00.000Z",
      ownerId: "novel_detail",
      ownerLabel: "《雾港巡夜人》",
      sourceRoute: "/novels/create?workflowTaskId=task_detail&mode=director",
      checkpointType: "candidate_selection_required",
      checkpointSummary: "请先确认书级方向。",
      resumeTarget: {
        route: "/novels/create",
        taskId: "task_detail",
        mode: "director",
      },
      nextActionLabel: "继续确认书级方向",
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
      startedAt: "2026-04-21T08:00:00.000Z",
      finishedAt: null,
      retryCountLabel: "1/3",
      meta: {},
      steps: [],
      failureDetails: null,
    };
  };
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "https://relay.example.test/dingtalk",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "https://relay.example.test/wecom",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const detail = await service.getDetail("task_detail");
    assert.ok(detail);
    assert.equal(detail.taskId, "task_detail");
    assert.equal(detail.reasonLabel, "待确认书级方向");
    assert.equal(detail.priority, "P1");
    assert.equal(detail.followUpSummary, "请先确认书级方向。");
    assert.equal(detail.currentModel, "anthropic/claude-sonnet-4-6");
    assert.equal(detail.originDetailUrl, "/tasks?kind=novel_workflow&id=task_detail");
    assert.equal(detail.candidateSelectionUrl, "/novels/create?workflowTaskId=task_detail&mode=director");
    assert.equal(detail.replanUrl, null);
    assert.deepEqual(detail.channelDeliveries, [{
      channelType: "dingtalk",
      status: "delivered",
      deliveredAt: "2026-04-22T09:20:00.000Z",
      responseStatus: 202,
      eventType: "auto_director.approval_required",
      target: "https://relay.example.test/dingtalk",
    }]);
    assert.deepEqual(detail.availableActions.map((item) => item.code), ["go_candidate_selection", "open_detail"]);
    assert.deepEqual(detail.milestones, [
      {
        label: "等待确认书级方向",
        at: "2026-04-21T08:30:00.000Z",
        status: "waiting_approval",
        summary: "请先确认书级方向。",
      },
    ]);
    assert.equal(detail.task.id, "task_detail");
  } finally {
    taskArchive.isTaskArchived = originals.isTaskArchived;
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.autoDirectorFollowUpNotificationLog.findMany = originals.notificationLogFindMany;
    NovelWorkflowTaskAdapter.prototype.detail = originals.adapterDetail;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service detail only marks replaced when replacement task exists", async () => {
  const originals = {
    isTaskArchived: taskArchive.isTaskArchived,
    findUnique: prisma.novelWorkflowTask.findUnique,
    notificationLogFindMany: prisma.autoDirectorFollowUpNotificationLog.findMany,
    adapterDetail: NovelWorkflowTaskAdapter.prototype.detail,
    getAutoDirectorChannelSettings: autoDirectorChannelSettingsService.getAutoDirectorChannelSettings,
  };
  const findUniqueCalls = [];

  taskArchive.isTaskArchived = async () => false;
  prisma.novelWorkflowTask.findUnique = async ({ where }) => {
    findUniqueCalls.push(where.id);
    if (where.id === "task_replaced_detail") {
      return buildWorkflowRow({
        id: "task_replaced_detail",
        novelId: "novel_detail",
        status: "succeeded",
        checkpointType: "workflow_completed",
        currentItemLabel: "任务已由新导演任务接管",
        seedPayloadJson: JSON.stringify({
          replacementTaskId: "task_replacement_exists",
        }),
        finishedAt: new Date("2026-04-21T09:00:00.000Z"),
      });
    }
    if (where.id === "task_replacement_exists") {
      return { id: "task_replacement_exists" };
    }
    return null;
  };
  prisma.autoDirectorFollowUpNotificationLog.findMany = async () => [];
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId, options) {
    assert.deepEqual(options, { heal: false });
    return {
      id: taskId,
      kind: "novel_workflow",
      title: "AI 自动导演",
      status: "succeeded",
      progress: 1,
      currentStage: "完成",
      currentItemKey: "workflow_completed",
      currentItemLabel: "任务已完成",
      executionScopeLabel: null,
      displayStatus: "任务已完成",
      blockingReason: null,
      resumeAction: null,
      lastHealthyStage: "完成",
      attemptCount: 1,
      maxAttempts: 3,
      lastError: null,
      createdAt: "2026-04-21T08:00:00.000Z",
      updatedAt: "2026-04-21T09:00:00.000Z",
      heartbeatAt: "2026-04-21T09:00:00.000Z",
      ownerId: "novel_detail",
      ownerLabel: "《雾港巡夜人》",
      sourceRoute: "/novels/novel_detail/edit",
      checkpointType: "workflow_completed",
      checkpointSummary: null,
      resumeTarget: null,
      nextActionLabel: null,
      noticeCode: null,
      noticeSummary: null,
      failureCode: null,
      failureSummary: null,
      recoveryHint: null,
      tokenUsage: null,
      sourceResource: null,
      targetResources: [],
      provider: null,
      model: null,
      startedAt: "2026-04-21T08:00:00.000Z",
      finishedAt: "2026-04-21T09:00:00.000Z",
      retryCountLabel: "1/3",
      meta: {},
      steps: [],
      failureDetails: null,
    };
  };
  autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = async () => ({
    baseUrl: "https://writer.example.test",
    dingtalk: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
    wecom: {
      webhookUrl: "",
      callbackToken: "",
      operatorMapJson: "",
      eventTypes: [],
    },
  });

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  const healCalls = [];
  service.workflowService.healAutoDirectorTaskState = async (taskId) => {
    healCalls.push(taskId);
    return false;
  };

  try {
    const detail = await service.getDetail("task_replaced_detail", { heal: false });

    assert.ok(detail);
    assert.equal(detail.reasonLabel, "任务已替代");
    assert.deepEqual(findUniqueCalls, ["task_replaced_detail", "task_replacement_exists"]);
    assert.deepEqual(healCalls, []);
  } finally {
    taskArchive.isTaskArchived = originals.isTaskArchived;
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.autoDirectorFollowUpNotificationLog.findMany = originals.notificationLogFindMany;
    NovelWorkflowTaskAdapter.prototype.detail = originals.adapterDetail;
    autoDirectorChannelSettingsService.getAutoDirectorChannelSettings = originals.getAutoDirectorChannelSettings;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto director follow-up service reflects runtime channel capabilities from configured webhooks", async () => {
  const originals = {
    getArchivedTaskIds: taskArchive.getArchivedTaskIds,
    findMany: prisma.novelWorkflowTask.findMany,
    autoApprovalFindMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
  };

  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;

  taskArchive.getArchivedTaskIds = async () => [];
  prisma.novelWorkflowTask.findMany = async () => ([
    buildWorkflowRow({
      id: "task_runtime_channels",
      checkpointType: "front10_ready",
    }),
  ]);
  prisma.autoDirectorAutoApprovalRecord.findMany = async () => [];
  prisma.appSetting.findMany = async () => [];

  const service = new AutoDirectorFollowUpService();
  const originalHeal = service.workflowService.healAutoDirectorTaskState;
  service.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const response = await service.list({
      page: 1,
      pageSize: 10,
    });

    assert.equal(response.items.length, 1);
    assert.deepEqual(response.items[0].channelCapabilities, {
      dingtalk: true,
      wecom: false,
    });
  } finally {
    taskArchive.getArchivedTaskIds = originals.getArchivedTaskIds;
    prisma.novelWorkflowTask.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.autoApprovalFindMany;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    service.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});
