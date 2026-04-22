const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { AutoDirectorFollowUpNotificationService } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService.js");
const { prisma } = require("../dist/db/prisma.js");

function buildWorkflowRow(overrides = {}) {
  return {
    id: "task_front10",
    novelId: "novel_1",
    lane: "auto_director",
    title: "AI 自动导演",
    status: "waiting_approval",
    progress: 0.7,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "等待继续自动执行",
    checkpointType: "front10_ready",
    checkpointSummary: "前 10 章已准备完成。",
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        scopeLabel: "前 10 章",
      },
    }),
    pendingManualRecovery: false,
    lastError: null,
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    novel: {
      title: "《雾港巡夜人》",
    },
    ...overrides,
  };
}

test("auto director follow-up notification service delivers approval-required events to dingtalk with callback actions", async () => {
  const originals = {
    fetch: global.fetch,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
  };
  const notifications = [];
  const fetchCalls = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => {
    notifications.push(data);
    return data;
  };
  global.fetch = async (url, init) => {
    fetchCalls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = "ding-callback-token";
  process.env.APP_BASE_URL = "https://writer.example.test";

  const service = new AutoDirectorFollowUpNotificationService();
  const before = buildWorkflowRow({
    status: "running",
    checkpointType: null,
    checkpointSummary: null,
    currentItemLabel: "正在执行前 10 章",
    updatedAt: new Date("2026-04-22T09:55:00.000Z"),
  });
  const after = buildWorkflowRow({
    status: "waiting_approval",
    checkpointType: "front10_ready",
    checkpointSummary: "前 10 章已准备完成。",
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
  });

  try {
    await service.handleTaskTransition({
      before,
      after,
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://relay.example.test/dingtalk");
    assert.equal(fetchCalls[0].method, "POST");
    assert.equal(fetchCalls[0].body.channelType, "dingtalk");
    assert.equal(fetchCalls[0].body.event.eventType, "auto_director.approval_required");
    assert.equal(fetchCalls[0].body.event.reason, "front10_execution_pending");
    assert.equal(fetchCalls[0].body.card.actions[0].kind, "callback");
    assert.equal(fetchCalls[0].body.card.actions[0].actionCode, "continue_auto_execution");
    assert.equal(
      fetchCalls[0].body.card.actions[0].callback.endpoint,
      "https://writer.example.test/api/auto-director/channel-callbacks/dingtalk",
    );
    assert.equal(
      fetchCalls[0].body.card.actions[0].callback.token,
      "ding-callback-token",
    );
    assert.equal(
      fetchCalls[0].body.card.actions.at(-1).url,
      "https://writer.example.test/auto-director/follow-ups?taskId=task_front10",
    );

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].eventType, "auto_director.approval_required");
    assert.equal(notifications[0].status, "delivered");
    assert.equal(notifications[0].responseStatus, 202);
    assert.equal(notifications[0].channelType, "dingtalk");
  } finally {
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
    global.fetch = originals.fetch;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
  }
});
