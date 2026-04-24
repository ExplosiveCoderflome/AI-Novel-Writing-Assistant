const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const {
  AutoDirectorFollowUpActionExecutor,
} = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");
const {
  AutoDirectorFollowUpService,
} = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("GET /api/tasks/auto-director-follow-ups/:taskId returns the follow-up detail", async () => {
  const originalGetDetail = AutoDirectorFollowUpService.prototype.getDetail;

  AutoDirectorFollowUpService.prototype.getDetail = async (taskId) => ({
    taskId,
    reason: "runtime_failed",
    reasonLabel: "失败待重试",
    priority: "P0",
    checkpointType: "replan_required",
    checkpointSummary: "需要先处理重规划",
    followUpSummary: "需要先处理重规划",
    blockingReason: "质量修复建议尚未处理。",
    executionScope: null,
    currentModel: "deepseek/chat",
    pendingManualRecovery: false,
    availableActions: [],
    batchActionCodes: [],
    supportsBatch: false,
    task: {
      id: taskId,
      kind: "novel_workflow",
      title: "自动导演任务",
      status: "failed",
      progress: 0.5,
      attemptCount: 1,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: "novel-1",
      ownerLabel: "小说 A",
      sourceRoute: "/novels/novel-1/edit",
      retryCountLabel: "1/3",
      meta: {},
      steps: [],
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tasks/auto-director-follow-ups/workflow-1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.taskId, "workflow-1");
    assert.equal(payload.data.reason, "runtime_failed");
  } finally {
    AutoDirectorFollowUpService.prototype.getDetail = originalGetDetail;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("POST /api/tasks/auto-director-follow-ups/:taskId/actions executes the action", async () => {
  const originalExecute = AutoDirectorFollowUpActionExecutor.prototype.execute;

  AutoDirectorFollowUpActionExecutor.prototype.execute = async (input) => ({
    taskId: input.taskId,
    actionCode: input.actionCode,
    code: "executed",
    message: "操作已执行。",
    task: null,
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tasks/auto-director-follow-ups/workflow-2/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionCode: "continue_generic",
        idempotencyKey: "resume-once",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.taskId, "workflow-2");
    assert.equal(payload.data.actionCode, "continue_generic");
  } finally {
    AutoDirectorFollowUpActionExecutor.prototype.execute = originalExecute;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
