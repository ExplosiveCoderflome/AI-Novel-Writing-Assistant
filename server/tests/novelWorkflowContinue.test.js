const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { stubLegacyNovelIdentity } = require("./legacyDirector/databasePorts.js");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const { DirectorCommandService } = require("../dist/services/novel/director/commands/DirectorCommandService.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { NovelWorkflowTaskAdapter } = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("novel workflow auto director route prefers the active auto director task over stale visible entries", { concurrency: false }, async (t) => {
  stubLegacyNovelIdentity(t, prisma, ["novel-active"]);
  const calls = [];
  const originalFindActive = NovelWorkflowService.prototype.findActiveDirectorTask;
  const originalDetailCompact = NovelWorkflowTaskAdapter.prototype.detailCompact;

  NovelWorkflowService.prototype.findActiveDirectorTask = async function findActiveDirectorTaskMock(novelId) {
    calls.push(["active", novelId]);
    return {
      id: "workflow-active",
    };
  };
  NovelWorkflowTaskAdapter.prototype.detailCompact = async function detailCompactMock(taskId) {
    calls.push(["detailCompact", taskId]);
    return {
      id: taskId,
      lane: "auto_director",
      status: "running",
      progress: 0.58,
      currentItemLabel: "正在生成第 1 卷节奏板",
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/novels/novel-active/auto-director`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.id, "workflow-active");
    assert.deepEqual(calls, [
      ["active", "novel-active"],
      ["detailCompact", "workflow-active"],
    ]);
  } finally {
    NovelWorkflowService.prototype.findActiveDirectorTask = originalFindActive;
    NovelWorkflowTaskAdapter.prototype.detailCompact = originalDetailCompact;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel workflow auto director route returns null when only historical visible tasks remain", { concurrency: false }, async (t) => {
  stubLegacyNovelIdentity(t, prisma, ["novel-idle"]);
  const calls = [];
  const originalTaskFindMany = prisma.novelWorkflowTask.findMany;
  const originalArchiveFindMany = prisma.taskCenterArchive.findMany;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  prisma.novelWorkflowTask.findMany = async (args) => {
    calls.push(["current", args.where.novelId, args.where.lane]);
    assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    return [{
      id: "workflow-historical",
      status: "cancelled",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }];
  };
  prisma.taskCenterArchive.findMany = async (args) => {
    calls.push(["archive", args.where.taskId.in]);
    return [];
  };
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId) {
    calls.push(["detail", taskId]);
    return {
      id: taskId,
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/novels/novel-idle/auto-director`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data, null);
    assert.equal(payload.message, "No active auto director task found.");
    assert.deepEqual(calls, [
      ["current", "novel-idle", "auto_director"],
      ["archive", ["workflow-historical"]],
    ]);
    assert.equal(calls.some(([kind]) => kind === "detail"), false);
  } finally {
    prisma.novelWorkflowTask.findMany = originalTaskFindMany;
    prisma.taskCenterArchive.findMany = originalArchiveFindMany;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel workflow continue route accepts range and resume commands but rejects a run-mode string", { concurrency: false }, async (t) => {
  const calls = [];
  const originalEnqueue = DirectorCommandService.prototype.enqueueContinueCommand;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  DirectorCommandService.prototype.enqueueContinueCommand = async function enqueueContinueCommandMock(taskId, input) {
    calls.push({ taskId, input, commandType: "continue" });
    return {
      commandId: "command-1",
      taskId,
      novelId: "novel-1",
      commandType: "continue",
      status: "queued",
      leaseExpiresAt: null,
    };
  };
  t.mock.method(DirectorCommandService.prototype, "enqueueApproveGateCommand", async (taskId, input) => {
    calls.push({ taskId, input, commandType: "approve_gate" });
    return { commandId: "command-2", taskId, commandType: "approve_gate", status: "queued" };
  });
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId) {
    return {
      id: taskId,
      lane: "auto_director",
      status: "running",
      checkpointType: "chapter_batch_ready",
      progress: 0.93,
      currentItemLabel: "正在自动执行前 10 章",
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/workflow-auto-exec/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        continuationMode: "auto_execute_range",
      }),
    });
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.commandId, "command-1");
    const fullBookResponse = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/workflow-auto-exec/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        continuationMode: "full_book_autopilot",
      }),
    });
    assert.equal(fullBookResponse.status, 400);
    assert.equal(calls.length, 1);
    const resumeResponse = await fetch(`http://127.0.0.1:${port}/api/novel-workflows/workflow-auto-exec/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ continuationMode: "resume" }),
    });
    assert.equal(resumeResponse.status, 202);
    const resumePayload = await resumeResponse.json();
    assert.equal(resumePayload.data.commandType, "approve_gate");
    assert.deepEqual(calls, [
      {
        taskId: "workflow-auto-exec",
        commandType: "continue",
        input: {
          continuationMode: "auto_execute_range",
        },
      },
      {
        taskId: "workflow-auto-exec",
        commandType: "approve_gate",
        input: {
          continuationMode: "resume",
        },
      },
    ]);
  } finally {
    DirectorCommandService.prototype.enqueueContinueCommand = originalEnqueue;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
