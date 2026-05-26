const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
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

test("novel workflow auto director route prefers the active auto director task over stale visible entries", { concurrency: false }, async () => {
  const calls = [];
  const originalFindActive = NovelWorkflowService.prototype.findActiveTaskByNovelAndLane;
  const originalFindLatest = NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  NovelWorkflowService.prototype.findActiveTaskByNovelAndLane = async function findActiveTaskByNovelAndLaneMock(novelId, lane) {
    calls.push(["active", novelId, lane]);
    return {
      id: "workflow-active",
    };
  };
  NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId = async function findLatestVisibleTaskByNovelIdMock(novelId, lane) {
    calls.push(["latest", novelId, lane]);
    return {
      id: "workflow-latest",
    };
  };
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId) {
    calls.push(["detail", taskId, arguments[1]]);
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
      ["active", "novel-active", "auto_director"],
      ["detail", "workflow-active", { seedPayloadMode: "compact" }],
    ]);
  } finally {
    NovelWorkflowService.prototype.findActiveTaskByNovelAndLane = originalFindActive;
    NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId = originalFindLatest;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel workflow auto director route returns null when only historical visible tasks remain", { concurrency: false }, async () => {
  const calls = [];
  const originalFindActive = NovelWorkflowService.prototype.findActiveTaskByNovelAndLane;
  const originalFindLatest = NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  NovelWorkflowService.prototype.findActiveTaskByNovelAndLane = async function findActiveTaskByNovelAndLaneMock(novelId, lane) {
    calls.push(["active", novelId, lane]);
    return null;
  };
  NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId = async function findLatestVisibleTaskByNovelIdMock() {
    calls.push(["latest"]);
    return {
      id: "workflow-historical",
    };
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
      ["active", "novel-idle", "auto_director"],
    ]);
  } finally {
    NovelWorkflowService.prototype.findActiveTaskByNovelAndLane = originalFindActive;
    NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId = originalFindLatest;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel workflow continue route enqueues auto_execute_range continuation mode", { concurrency: false }, async () => {
  const calls = [];
  const originalEnqueue = DirectorCommandService.prototype.enqueueContinueCommand;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  DirectorCommandService.prototype.enqueueContinueCommand = async function enqueueContinueCommandMock(taskId, input) {
    calls.push({ taskId, input });
    return {
      commandId: "command-1",
      taskId,
      novelId: "novel-1",
      commandType: "continue",
      status: "queued",
      leaseExpiresAt: null,
    };
  };
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
    assert.deepEqual(calls, [
      {
        taskId: "workflow-auto-exec",
        input: {
          continuationMode: "auto_execute_range",
        },
      },
    ]);
  } finally {
    DirectorCommandService.prototype.enqueueContinueCommand = originalEnqueue;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
