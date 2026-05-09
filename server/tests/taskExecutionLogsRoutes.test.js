const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { directorExecutionLogger } = require("../dist/services/director/executionLogger.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("GET /api/tasks/execution-logs/:taskId resolves to execution log route", async () => {
  const originalGetByTaskId = directorExecutionLogger.getByTaskId;
  directorExecutionLogger.getByTaskId = async (taskId, options) => ({
    logs: [{
      id: "log-1",
      taskId,
      novelId: "novel-1",
      stage: "chapter_execution",
      level: "info",
      message: "log message",
      detail: null,
      durationMs: null,
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
    }],
    total: options?.limit ?? 1,
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tasks/execution-logs/task-route-test?limit=1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.total, 1);
    assert.equal(payload.data.logs[0].taskId, "task-route-test");
  } finally {
    directorExecutionLogger.getByTaskId = originalGetByTaskId;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
