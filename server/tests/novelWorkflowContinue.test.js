const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
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

test("novel workflow auto director route prefers the active auto director task over stale visible entries", async () => {
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
    ]);
  } finally {
    NovelWorkflowService.prototype.findActiveTaskByNovelAndLane = originalFindActive;
    NovelWorkflowService.prototype.findLatestVisibleTaskByNovelId = originalFindLatest;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel workflow continue route forwards auto_execute_front10 continuation mode", async () => {
  const calls = [];
  const originalContinue = NovelDirectorService.prototype.continueTask;
  const originalDetail = NovelWorkflowTaskAdapter.prototype.detail;

  NovelDirectorService.prototype.continueTask = async function continueTaskMock(taskId, input) {
    calls.push({ taskId, input });
  };
  NovelWorkflowTaskAdapter.prototype.detail = async function detailMock(taskId) {
    return {
      id: taskId,
      lane: "auto_director",
      status: "running",
      checkpointType: "front10_ready",
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
        continuationMode: "auto_execute_front10",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.id, "workflow-auto-exec");
    assert.deepEqual(calls, [
      {
        taskId: "workflow-auto-exec",
        input: {
          continuationMode: "auto_execute_front10",
        },
      },
    ]);
  } finally {
    NovelDirectorService.prototype.continueTask = originalContinue;
    NovelWorkflowTaskAdapter.prototype.detail = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
