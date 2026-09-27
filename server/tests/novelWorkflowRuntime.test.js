const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelWorkflowRuntimeService,
} = require("../dist/services/novel/workflow/NovelWorkflowRuntimeService.js");
const {
  NovelWorkflowService,
} = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

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

test("stale running auto director healing does not recurse through markTaskFailed", async () => {
  const originals = {
    archiveFindUnique: prisma.taskCenterArchive.findUnique,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    taskUpdate: prisma.novelWorkflowTask.update,
  };
  const updates = [];
  const staleRow = {
    id: "task-stale",
    novelId: "novel-1",
    lane: "auto_director",
    status: "running",
    progress: 0.4,
    currentStage: "结构化大纲",
    currentItemKey: "chapter_detail_bundle",
    currentItemLabel: "生成章节细纲",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    seedPayloadJson: null,
    milestonesJson: null,
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    heartbeatAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };

  prisma.taskCenterArchive.findUnique = async () => null;
  prisma.novelWorkflowTask.findUnique = async () => staleRow;
  prisma.novelWorkflowTask.update = async ({ data }) => {
    updates.push(data);
    return {
      ...staleRow,
      ...data,
      novel: { title: "测试小说" },
      updatedAt: new Date("2026-05-04T00:00:00.000Z"),
    };
  };

  try {
    const service = new NovelWorkflowService();
    service.markTaskFailed = async () => {
      throw new Error("healStaleAutoDirectorRunningTask must not call markTaskFailed");
    };
    service.notifyAutoDirectorTaskTransition = async () => {};

    const changed = await service.healStaleAutoDirectorRunningTask("task-stale", staleRow);

    assert.equal(changed, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, "failed");
    assert.equal(updates[0].lastError, "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。");
  } finally {
    prisma.taskCenterArchive.findUnique = originals.archiveFindUnique;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    prisma.novelWorkflowTask.update = originals.taskUpdate;
  }
});

test("startup recovery locks interrupted auto director tasks without auto-enqueuing a recovery command", async () => {
  const calls = [];
  const { RecoveryTaskService } = require("../dist/services/task/RecoveryTaskService.js");
  const task = { id: "task-restarted", status: "running", pendingManualRecovery: false };
  const workflowRuntime = new NovelWorkflowRuntimeService({
    async listRecoverableAutoDirectorTasks() {
      return task.pendingManualRecovery ? [] : [task];
    },
    async requeueTaskForRecovery(taskId, message) {
      calls.push(["manual-recovery", taskId, message]);
      task.status = "queued";
      task.pendingManualRecovery = true;
    },
    async markTaskFailed(taskId, message) {
      calls.push(["failed", taskId, message]);
    },
  });
  const directorCommandService = {
    async enqueueRecoveryCommand(taskId) {
      calls.push(["background-command", taskId]);
    },
  };
  const recoveryService = new RecoveryTaskService(
    undefined,
    undefined,
    directorCommandService,
    undefined,
    {
      async markPendingBookAnalysesForManualRecovery() {
        calls.push(["manual-book"]);
      },
      async markPendingImageTasksForManualRecovery() {
        calls.push(["manual-image"]);
      },
      async markPendingAutoDirectorTasksForManualRecovery() {
        await workflowRuntime.markPendingAutoDirectorTasksForManualRecovery();
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

  assert.equal(task.status, "queued");
  assert.equal(task.pendingManualRecovery, true);
  assert.equal(calls.filter((call) => call[0] === "manual-recovery").length, 1);
  assert.equal(calls.filter((call) => call[0] === "background-command").length, 0);
});
