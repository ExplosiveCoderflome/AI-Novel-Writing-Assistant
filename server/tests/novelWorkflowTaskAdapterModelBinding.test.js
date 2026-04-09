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
