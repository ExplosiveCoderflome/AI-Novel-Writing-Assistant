const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { AutoDirectorFollowUpActionExecutor } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("auto director channel callback route executes dingtalk low-risk actions through the shared executor", async () => {
  const originals = {
    execute: AutoDirectorFollowUpActionExecutor.prototype.execute,
  };
  const calls = [];
  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN,
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
  };

  process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = "ding-callback-token";
  process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = JSON.stringify({
    ding_user_1: "user_1",
  });

  AutoDirectorFollowUpActionExecutor.prototype.execute = async function executeMock(input) {
    calls.push(input);
    return {
      taskId: input.taskId,
      actionCode: input.actionCode,
      code: "executed",
      message: "执行成功",
      task: {
        id: input.taskId,
        kind: "novel_workflow",
        status: "running",
      },
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auto-director/channel-callbacks/dingtalk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auto-director-dingtalk-token": "ding-callback-token",
      },
      body: JSON.stringify({
        userId: "ding_user_1",
        callbackId: "cb_1",
        eventId: "evt_1",
        taskId: "task_1",
        actionCode: "continue_auto_execution",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.code, "executed");
    assert.equal(payload.data.channelType, "dingtalk");
    assert.deepEqual(calls, [{
      taskId: "task_1",
      actionCode: "continue_auto_execution",
      source: "dingtalk",
      operatorId: "user_1",
      idempotencyKey: "dingtalk:cb_1",
      metadata: {
        channelUserId: "ding_user_1",
        callbackId: "cb_1",
        eventId: "evt_1",
      },
    }]);
  } finally {
    AutoDirectorFollowUpActionExecutor.prototype.execute = originals.execute;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
