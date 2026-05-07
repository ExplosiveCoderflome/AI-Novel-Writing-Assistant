const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { NovelWorkflowTaskAdapter } = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");
const { prisma } = require("../dist/db/prisma.js");

test("task detail exposes candidate-stage bound model before directorInput exists", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_candidate_binding",
    title: "AI 自动导演",
    lane: "auto_director",
    status: "running",
    progress: 0.1,
    currentStage: "AI 自动导演",
    currentItemKey: "candidate_direction_batch",
    currentItemLabel: "正在生成第一批书级方案",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: new Date("2026-04-09T09:00:00.000Z"),
    updatedAt: new Date("2026-04-09T09:05:00.000Z"),
    heartbeatAt: new Date("2026-04-09T09:05:00.000Z"),
    promptTokens: 1200,
    completionTokens: 600,
    totalTokens: 1800,
    llmCallCount: 2,
    lastTokenRecordedAt: new Date("2026-04-09T09:05:00.000Z"),
    novelId: null,
    novel: null,
    startedAt: new Date("2026-04-09T09:00:00.000Z"),
    finishedAt: null,
    cancelRequestedAt: null,
    milestonesJson: null,
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      candidateStage: {
        mode: "generate",
      },
    }),
  });

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const detail = await adapter.detail("task_candidate_binding");
    assert.ok(detail);
    assert.equal(detail.provider, "custom_coding_plan");
    assert.equal(detail.model, "kimi-k2.5");
    assert.deepEqual(detail.meta.llm, {
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
    });
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("task detail compact mode strips heavyweight auto-director seed payload from polling responses", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_compact_auto_director",
    title: "AI 自动导演",
    lane: "auto_director",
    status: "running",
    progress: 0.76,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution_node",
    currentItemLabel: "等待确认章节执行",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "该动作可能覆盖用户手写内容，需要确认后继续。",
    resumeTargetJson: JSON.stringify({
      stage: "chapter",
      chapterId: "chapter-1",
      volumeId: "volume-1",
    }),
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: new Date("2026-04-09T09:00:00.000Z"),
    updatedAt: new Date("2026-04-09T09:05:00.000Z"),
    heartbeatAt: new Date("2026-04-09T09:05:00.000Z"),
    promptTokens: 1200,
    completionTokens: 600,
    totalTokens: 1800,
    llmCallCount: 2,
    lastTokenRecordedAt: new Date("2026-04-09T09:05:00.000Z"),
    novelId: "novel-1",
    novel: { title: "测试小说" },
    startedAt: new Date("2026-04-09T09:00:00.000Z"),
    finishedAt: null,
    cancelRequestedAt: null,
    milestonesJson: JSON.stringify([{
      checkpointType: "chapter_batch_ready",
      summary: "章节批次待确认",
      createdAt: "2026-04-09T09:05:00.000Z",
    }]),
    seedPayloadJson: JSON.stringify({
      idea: "这段只用于创建弹窗恢复，不应该进入运行态轮询。",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      runMode: "auto_to_execution",
      batches: [{
        id: "batch-heavy",
        candidates: [{ title: "大段方案", content: "x".repeat(200_000) }],
      }],
      directorSession: {
        phase: "chapter_execution",
        reviewScope: "chapter",
        heavyweightRuntimeSnapshot: "x".repeat(200_000),
      },
      autoExecution: {
        scopeLabel: "前 3 章",
        totalChapterCount: 3,
        heavyweightChapterDrafts: "x".repeat(200_000),
      },
      styleIntentSummary: {
        headline: "高压爽文",
        styleProfileName: "爽感强",
        stageSummaryLines: ["节奏快", "冲突强"],
        heavyweightPrompt: "x".repeat(200_000),
      },
      takeover: {
        downstreamReset: {
          resetStatus: "not_started",
          resetSteps: ["chapter"],
          heavyweightSnapshot: "x".repeat(200_000),
        },
      },
    }),
  });

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const detail = await adapter.detail("task_compact_auto_director", { seedPayloadMode: "compact" });
    assert.ok(detail);
    assert.equal(detail.provider, "deepseek");
    assert.equal(detail.model, "deepseek-v4-flash");
    assert.equal(detail.meta.seedPayload.idea, undefined);
    assert.equal(detail.meta.seedPayload.batches, undefined);
    assert.equal(detail.meta.seedPayload.autoExecution.scopeLabel, "前 3 章");
    assert.equal(detail.meta.seedPayload.autoExecution.heavyweightChapterDrafts, undefined);
    assert.equal(detail.meta.directorSession.phase, "chapter_execution");
    assert.equal(detail.meta.directorSession.heavyweightRuntimeSnapshot, undefined);
    assert.equal(detail.meta.seedPayload.styleIntentSummary.headline, "高压爽文");
    assert.equal(detail.meta.seedPayload.styleIntentSummary.heavyweightPrompt, undefined);
    assert.equal(detail.meta.seedPayload.takeover.downstreamReset.resetStatus, "not_started");
    assert.equal(detail.meta.seedPayload.takeover.downstreamReset.heavyweightSnapshot, undefined);
    assert.ok(JSON.stringify(detail).length < 12000);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("auto-director retry resumes failed tasks by default", async () => {
  const originals = {
    archiveFindUnique: prisma.taskCenterArchive.findUnique,
  };
  const adapter = new NovelWorkflowTaskAdapter();
  const originalGetTaskById = adapter.workflowService.getTaskById;
  const originalRetryTask = adapter.workflowService.retryTask;
  const originalContinueTask = adapter.novelDirectorService.continueTask;
  const originalDetail = adapter.detail;
  const calls = [];

  prisma.taskCenterArchive.findUnique = async () => null;
  adapter.workflowService.getTaskById = async () => ({
    id: "task_failed_auto_director",
    lane: "auto_director",
    status: "failed",
  });
  adapter.workflowService.retryTask = async (taskId) => {
    calls.push(["retry", taskId]);
  };
  adapter.novelDirectorService.continueTask = async (taskId, input) => {
    calls.push(["continue", taskId, input]);
  };
  adapter.detail = async (taskId) => ({
    id: taskId,
    kind: "novel_workflow",
  });

  try {
    const detail = await adapter.retry({
      id: "task_failed_auto_director",
    });

    assert.equal(detail.id, "task_failed_auto_director");
    assert.deepEqual(calls, [
      ["retry", "task_failed_auto_director"],
      ["continue", "task_failed_auto_director", { batchAlreadyStartedCount: undefined, forceResume: true }],
    ]);
  } finally {
    prisma.taskCenterArchive.findUnique = originals.archiveFindUnique;
    adapter.workflowService.getTaskById = originalGetTaskById;
    adapter.workflowService.retryTask = originalRetryTask;
    adapter.novelDirectorService.continueTask = originalContinueTask;
    adapter.detail = originalDetail;
  }
});

test("task center list only queries auto director workflow rows", async () => {
  const originals = {
    findMany: prisma.novelWorkflowTask.findMany,
  };

  const rows = [
    {
      id: "task_auto_director",
      title: "AI 自动导演",
      lane: "auto_director",
      status: "running",
      progress: 0.58,
      currentStage: "节奏 / 拆章",
      currentItemKey: "beat_sheet",
      currentItemLabel: "正在生成第 1 卷节奏板",
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: null,
      attemptCount: 0,
      maxAttempts: 3,
      lastError: null,
      createdAt: new Date("2026-04-09T13:00:00.000Z"),
      updatedAt: new Date("2026-04-09T13:01:00.000Z"),
      heartbeatAt: new Date("2026-04-09T13:01:00.000Z"),
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      llmCallCount: 2,
      lastTokenRecordedAt: new Date("2026-04-09T13:01:00.000Z"),
      novelId: "novel_demo",
      novel: {
        title: "示例小说",
      },
    },
    {
      id: "task_manual_create",
      title: "小说创作",
      lane: "manual_create",
      status: "waiting_approval",
      progress: 0.26,
      currentStage: "项目设定",
      currentItemKey: "project_setup",
      currentItemLabel: "项目设定已打开",
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: null,
      attemptCount: 0,
      maxAttempts: 3,
      lastError: null,
      createdAt: new Date("2026-04-09T13:00:00.000Z"),
      updatedAt: new Date("2026-04-09T13:02:00.000Z"),
      heartbeatAt: new Date("2026-04-09T13:02:00.000Z"),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      llmCallCount: 0,
      lastTokenRecordedAt: null,
      novelId: "novel_demo",
      novel: {
        title: "示例小说",
      },
    },
  ];

  const whereSnapshots = [];
  prisma.novelWorkflowTask.findMany = async ({ where }) => {
    whereSnapshots.push(where);
    return rows.filter((row) => !where?.lane || row.lane === where.lane);
  };

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const list = await adapter.list({
      take: 10,
    });

    assert.equal(whereSnapshots.length, 1);
    assert.equal(whereSnapshots[0].lane, "auto_director");
    assert.deepEqual(list.map((item) => item.id), ["task_auto_director"]);
    assert.equal(list[0].displayStatus, "节奏 / 拆章进行中");
    assert.equal(list[0].resumeAction, "查看当前进度");
    assert.equal(list[0].lastHealthyStage, "节奏 / 拆章");
  } finally {
    prisma.novelWorkflowTask.findMany = originals.findMany;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("task center list treats restart recovery note as running recovery instead of failure", async () => {
  const originals = {
    findMany: prisma.novelWorkflowTask.findMany,
  };

  prisma.novelWorkflowTask.findMany = async () => ([
    {
      id: "task_recovering",
      title: "AI 自动导演",
      lane: "auto_director",
      status: "running",
      progress: 0.85,
      currentStage: "节奏 / 拆章",
      currentItemKey: "beat_sheet",
      currentItemLabel: "正在生成第 1 卷节奏板",
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: null,
      attemptCount: 1,
      maxAttempts: 3,
      lastError: "自动导演任务因服务重启中断，正在尝试恢复。",
      createdAt: new Date("2026-04-09T18:00:00.000Z"),
      updatedAt: new Date("2026-04-09T18:08:53.000Z"),
      heartbeatAt: new Date("2026-04-09T18:08:53.000Z"),
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      llmCallCount: 2,
      lastTokenRecordedAt: new Date("2026-04-09T18:08:53.000Z"),
      novelId: "novel_demo",
      novel: {
        title: "示例小说",
      },
    },
  ]);

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const list = await adapter.list({
      take: 10,
    });

    assert.equal(list.length, 1);
    assert.equal(list[0].status, "running");
    assert.equal(list[0].displayStatus, "节奏 / 拆章恢复中");
    assert.equal(list[0].blockingReason, "自动导演任务因服务重启中断，正在尝试恢复。");
    assert.equal(list[0].lastError, null);
    assert.equal(list[0].failureSummary, null);
  } finally {
    prisma.novelWorkflowTask.findMany = originals.findMany;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("task center list keeps manual recovery tasks out of running display state", async () => {
  const originals = {
    findMany: prisma.novelWorkflowTask.findMany,
  };

  prisma.novelWorkflowTask.findMany = async () => ([
    {
      id: "task_manual_recovery",
      title: "AI 自动导演",
      lane: "auto_director",
      status: "running",
      pendingManualRecovery: true,
      progress: 0.78,
      currentStage: "节奏 / 拆章",
      currentItemKey: "chapter_list",
      currentItemLabel: "正在生成第 1 卷节奏段：开卷抓手",
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: null,
      attemptCount: 2,
      maxAttempts: 3,
      lastError: "服务重启后任务已暂停，等待手动恢复。",
      createdAt: new Date("2026-04-29T03:19:37.000Z"),
      updatedAt: new Date("2026-04-29T05:38:33.000Z"),
      heartbeatAt: new Date("2026-04-29T05:38:33.000Z"),
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      llmCallCount: 2,
      lastTokenRecordedAt: new Date("2026-04-29T05:38:33.000Z"),
      novelId: "novel_demo",
      novel: {
        title: "示例小说",
      },
    },
  ]);

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const list = await adapter.list({
      take: 10,
    });

    assert.equal(list.length, 1);
    assert.equal(list[0].status, "queued");
    assert.equal(list[0].pendingManualRecovery, true);
    assert.equal(list[0].displayStatus, "等待手动恢复");
    assert.equal(list[0].blockingReason, "服务重启后任务已暂停，等待手动恢复。");
    assert.equal(list[0].resumeAction, "从最近检查点恢复");
    assert.equal(list[0].recoveryHint, "服务重启后任务已暂停，等待手动恢复。");
  } finally {
    prisma.novelWorkflowTask.findMany = originals.findMany;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("task center list surfaces actual auto execution range in explainability fields", async () => {
  const originals = {
    findMany: prisma.novelWorkflowTask.findMany,
  };

  prisma.novelWorkflowTask.findMany = async () => ([
    {
      id: "task_range_ready",
      title: "AI 自动导演",
      lane: "auto_director",
      status: "waiting_approval",
      progress: 0.92,
      currentStage: "章节执行",
      currentItemKey: "chapter_execution",
      currentItemLabel: "第 11-20 章已准备完成",
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "第 11-20 章细化已准备完成。",
      resumeTargetJson: null,
      attemptCount: 1,
      maxAttempts: 3,
      lastError: null,
      createdAt: new Date("2026-04-17T09:00:00.000Z"),
      updatedAt: new Date("2026-04-17T09:08:53.000Z"),
      heartbeatAt: new Date("2026-04-17T09:08:53.000Z"),
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      llmCallCount: 2,
      lastTokenRecordedAt: new Date("2026-04-17T09:08:53.000Z"),
      novelId: "novel_demo",
      novel: {
        title: "示例小说",
      },
      seedPayloadJson: JSON.stringify({
        autoExecution: {
          enabled: true,
          mode: "chapter_range",
          scopeLabel: "第 11-20 章",
          startOrder: 11,
          endOrder: 20,
        },
      }),
    },
  ]);

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const list = await adapter.list({
      take: 10,
    });

    assert.equal(list.length, 1);
    assert.equal(list[0].executionScopeLabel, "第 11-20 章");
    assert.equal(list[0].displayStatus, "第 11-20 章已可进入章节执行");
    assert.equal(list[0].resumeAction, "继续自动执行第 11-20 章");
    assert.match(String(list[0].blockingReason), /第 11-20 章细化已准备完成/);
  } finally {
    prisma.novelWorkflowTask.findMany = originals.findMany;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});

test("task detail treats review-blocked auto execution as skippable continuation", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_review_blocked",
    title: "AI 自动导演",
    lane: "auto_director",
    status: "failed",
    progress: 0.98,
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    currentItemLabel: "前 10 章自动执行已暂停",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "前 10 章已进入自动执行，但当前批量任务未完全完成：Chapter generation is blocked until review is resolved.",
    resumeTargetJson: null,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: "Chapter generation is blocked until review is resolved. 4 pending state proposal(s)",
    createdAt: new Date("2026-04-16T10:00:00.000Z"),
    updatedAt: new Date("2026-04-16T10:05:00.000Z"),
    heartbeatAt: new Date("2026-04-16T10:05:00.000Z"),
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    llmCallCount: 2,
    lastTokenRecordedAt: new Date("2026-04-16T10:05:00.000Z"),
    novelId: "novel_demo",
    novel: {
      title: "示例小说",
    },
    startedAt: new Date("2026-04-16T10:00:00.000Z"),
    finishedAt: new Date("2026-04-16T10:05:00.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
    seedPayloadJson: JSON.stringify({
      provider: "deepseek",
      model: "deepseek-chat",
      autoExecution: {
        enabled: true,
        mode: "chapter_range",
        scopeLabel: "前 10 章",
        startOrder: 1,
        endOrder: 10,
        totalChapterCount: 10,
        remainingChapterCount: 9,
        nextChapterOrder: 2,
        nextChapterId: "chapter-2",
      },
    }),
  });

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const detail = await adapter.detail("task_review_blocked");
    assert.ok(detail);
    assert.equal(detail.lastError, null);
    assert.equal(detail.failureCode, null);
    assert.match(String(detail.failureSummary), /允许跳过当前章继续执行/);
    assert.match(String(detail.failureSummary), /第 2 章继续/);
    assert.match(String(detail.blockingReason), /第 2 章继续/);
    assert.match(String(detail.checkpointSummary), /当前仍有 9 章待继续/);
    assert.doesNotMatch(String(detail.checkpointSummary), /Chapter generation is blocked until review is resolved/);
    assert.match(String(detail.recoveryHint), /继续自动执行前 10 章/);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});
