const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
const { NovelWorkflowTaskAdapter } = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

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
