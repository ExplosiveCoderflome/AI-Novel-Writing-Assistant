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
