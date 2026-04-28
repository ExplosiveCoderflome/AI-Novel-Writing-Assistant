const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelWorkflowRuntimeService,
} = require("../dist/services/novel/workflow/NovelWorkflowRuntimeService.js");

test("resumePendingAutoDirectorTasks requeues interrupted running tasks before continuing", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [{ id: "task-running", status: "running" }];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
      async markTaskFailed(taskId, message) {
        calls.push(["failed", taskId, message]);
      },
    },
    {
      async continueTask(taskId) {
        calls.push(["continue", taskId]);
      },
    },
  );

  await runtimeService.resumePendingAutoDirectorTasks();

  assert.deepEqual(calls, [
    ["requeue", "task-running", "自动导演任务因服务重启中断，正在尝试恢复。"],
    ["continue", "task-running"],
  ]);
});

test("resumePendingAutoDirectorTasks continues queued tasks without marking them for manual recovery", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [{ id: "task-queued", status: "queued" }];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
      async markTaskFailed(taskId, message) {
        calls.push(["failed", taskId, message]);
      },
    },
    {
      async continueTask(taskId) {
        calls.push(["continue", taskId]);
      },
    },
  );

  await runtimeService.resumePendingAutoDirectorTasks();

  assert.deepEqual(calls, [
    ["continue", "task-queued"],
  ]);
});

test("resumePendingAutoDirectorTasks marks failed when recovery throws", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [{ id: "task-queued", status: "queued" }];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
      async restoreTaskToCheckpoint(taskId) {
        calls.push(["restore", taskId]);
      },
      async markTaskFailed(taskId, message) {
        calls.push(["failed", taskId, message]);
      },
    },
    {
      async continueTask() {
        throw new Error("缺少恢复上下文");
      },
    },
  );

  await runtimeService.resumePendingAutoDirectorTasks();

  assert.deepEqual(calls, [
    ["failed", "task-queued", "服务重启后恢复失败：缺少恢复上下文"],
  ]);
});

test("resumePendingAutoDirectorTasks restores checkpoint instead of failing when recovery is no longer needed", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [{ id: "task-front10", status: "queued" }];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
      async restoreTaskToCheckpoint(taskId) {
        calls.push(["restore", taskId]);
      },
      async markTaskFailed(taskId, message) {
        calls.push(["failed", taskId, message]);
      },
    },
    {
      async continueTask() {
        const error = new Error("当前导演产物已经完整，无需继续自动导演。");
        error.code = "director_recovery_not_needed";
        throw error;
      },
    },
  );

  await runtimeService.resumePendingAutoDirectorTasks();

  assert.deepEqual(calls, [
    ["restore", "task-front10"],
  ]);
});

test("markPendingAutoDirectorTasksForManualRecovery only marks tasks without continuing them", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [
          { id: "task-queued", status: "queued" },
          { id: "task-running", status: "running" },
        ];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
    },
    {
      async continueTask(taskId) {
        calls.push(["continue", taskId]);
      },
    },
  );

  await runtimeService.markPendingAutoDirectorTasksForManualRecovery();

  assert.deepEqual(calls, [
    ["requeue", "task-queued", "服务重启后任务已暂停，等待手动恢复。"],
    ["requeue", "task-running", "服务重启后任务已暂停，等待手动恢复。"],
  ]);
});

test("markPendingAutoDirectorTasksForManualRecovery marks stale running tasks as failed when configured", async () => {
  const calls = [];
  const runtimeService = new NovelWorkflowRuntimeService(
    {
      async listRecoverableAutoDirectorTasks() {
        return [
          { id: "task-stale", status: "running", stale: true },
          { id: "task-fresh", status: "running" },
        ];
      },
      async requeueTaskForRecovery(taskId, message) {
        calls.push(["requeue", taskId, message]);
      },
      async markTaskFailed(taskId, message) {
        calls.push(["failed", taskId, message]);
      },
    },
    {
      async continueTask(taskId) {
        calls.push(["continue", taskId]);
      },
    },
  );

  await runtimeService.markPendingAutoDirectorTasksForManualRecovery({
    staleRunningAsFailed: true,
  });

  assert.deepEqual(calls, [
    ["failed", "task-stale", "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。"],
    ["requeue", "task-fresh", "服务重启后任务已暂停，等待手动恢复。"],
  ]);
});

test("startup recovery initialization auto-continues interrupted auto director tasks", async () => {
  const calls = [];
  const { RecoveryTaskService } = require("../dist/services/task/RecoveryTaskService.js");
  const recoveryService = new RecoveryTaskService(
    undefined,
    undefined,
    undefined,
    undefined,
    {
      async markPendingBookAnalysesForManualRecovery() {
        calls.push(["manual-book"]);
      },
      async markPendingImageTasksForManualRecovery() {
        calls.push(["manual-image"]);
      },
      async resumePendingAutoDirectorTasks() {
        calls.push(["resume-auto-director"]);
      },
      async markPendingPipelineJobsForManualRecovery() {
        calls.push(["manual-pipeline"]);
      },
      async markPendingStyleTasksForManualRecovery() {
        calls.push(["manual-style"]);
      },
    },
  );

  await recoveryService.initializePendingRecoveries();

  assert.deepEqual(calls.filter((call) => call[0].includes("auto-director")), [
    ["resume-auto-director"],
  ]);
});

test("recovery candidate listing builds lightweight summaries without task details", async () => {
  const { RecoveryTaskService } = require("../dist/services/task/RecoveryTaskService.js");
  const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");
  const { prisma } = require("../dist/db/prisma.js");
  const originals = {
    workflowFindMany: prisma.novelWorkflowTask.findMany,
    pipelineFindMany: prisma.generationJob.findMany,
    bookFindMany: prisma.bookAnalysis.findMany,
    imageFindMany: prisma.imageGenerationTask.findMany,
    styleFindMany: prisma.styleExtractionTask.findMany,
    getTaskDetail: taskCenterService.getTaskDetail,
  };

  prisma.novelWorkflowTask.findMany = async () => ([{
    id: "task-recovery-workflow",
    title: "AI 自动导演",
    status: "running",
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_detail_bundle",
    currentItemLabel: "正在细化章节",
    checkpointType: null,
    resumeTargetJson: JSON.stringify({
      route: "/novels/:id/edit",
      novelId: "novel-recovery",
      taskId: "task-recovery-workflow",
      stage: "structured",
    }),
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        scopeLabel: "全书",
      },
    }),
    lastError: "服务重启后任务已暂停，等待手动恢复。",
    novelId: "novel-recovery",
    updatedAt: new Date("2026-04-28T10:00:00.000Z"),
    novel: {
      title: "恢复测试书",
    },
  }]);
  prisma.generationJob.findMany = async () => [];
  prisma.bookAnalysis.findMany = async () => [];
  prisma.imageGenerationTask.findMany = async () => [];
  prisma.styleExtractionTask.findMany = async () => [];
  taskCenterService.getTaskDetail = async () => {
    throw new Error("recovery candidate list must not load task details");
  };

  try {
    const recoveryService = new RecoveryTaskService();
    const result = await recoveryService.listRecoveryCandidates();

    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      id: "task-recovery-workflow",
      kind: "novel_workflow",
      title: "AI 自动导演",
      ownerLabel: "恢复测试书",
      status: "running",
      currentStage: "节奏 / 拆章",
      currentItemLabel: "正在细化章节",
      resumeAction: "查看当前进度",
      sourceRoute: "/novels/novel-recovery/edit?stage=structured&taskId=task-recovery-workflow",
      recoveryHint: "服务重启后任务已暂停，等待手动恢复。",
    });
  } finally {
    prisma.novelWorkflowTask.findMany = originals.workflowFindMany;
    prisma.generationJob.findMany = originals.pipelineFindMany;
    prisma.bookAnalysis.findMany = originals.bookFindMany;
    prisma.imageGenerationTask.findMany = originals.imageFindMany;
    prisma.styleExtractionTask.findMany = originals.styleFindMany;
    taskCenterService.getTaskDetail = originals.getTaskDetail;
  }
});
