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
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const notifications = [];
  const fetchCalls = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => {
    notifications.push(data);
    return data;
  };
  prisma.appSetting.findMany = async () => [];
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
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN,
    AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = "ding-callback-token";
  process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = JSON.stringify({
    ding_user_1: "user_1",
  });
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
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
    prisma.appSetting.findMany = originals.appSettingFindMany;
    global.fetch = originals.fetch;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
  }
});

test("auto director follow-up notification service delivers approval-required events to wecom with callback actions", async () => {
  const originals = {
    fetch: global.fetch,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const notifications = [];
  const fetchCalls = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => {
    notifications.push(data);
    return data;
  };
  prisma.appSetting.findMany = async () => [];
  global.fetch = async (url, init) => {
    fetchCalls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN,
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN,
    AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  delete process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
  process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = "https://relay.example.test/wecom";
  process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = "wecom-callback-token";
  process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON = JSON.stringify({
    wecom_user_1: "user_9",
  });
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
    assert.equal(fetchCalls[0].url, "https://relay.example.test/wecom");
    assert.equal(fetchCalls[0].method, "POST");
    assert.equal(fetchCalls[0].body.msgtype, "markdown");
    assert.match(fetchCalls[0].body.markdown.content, /自动导演跟进提醒/);
    assert.match(fetchCalls[0].body.markdown.content, /前 10 章已准备完成。/);
    assert.match(fetchCalls[0].body.markdown.content, /\[继续自动执行.*\]\(https:\/\/writer\.example\.test\/api\/auto-director\/channel-callbacks\/wecom\/execute\?/);
    assert.match(fetchCalls[0].body.markdown.content, /actionCode=continue_auto_execution/);
    assert.match(fetchCalls[0].body.markdown.content, /callbackId=/);
    assert.match(fetchCalls[0].body.markdown.content, /signature=/);
    assert.match(fetchCalls[0].body.markdown.content, /\[查看详情\]\(https:\/\/writer\.example\.test\/tasks\?kind=novel_workflow&id=task_front10\)/);
    assert.match(fetchCalls[0].body.markdown.content, /\[打开跟进中心\]\(https:\/\/writer\.example\.test\/auto-director\/follow-ups\?taskId=task_front10\)/);

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].eventType, "auto_director.approval_required");
    assert.equal(notifications[0].status, "delivered");
    assert.equal(notifications[0].responseStatus, 200);
    assert.equal(notifications[0].channelType, "wecom");
  } finally {
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    global.fetch = originals.fetch;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
  }
});

test("auto director follow-up notification service degrades dingtalk actions to links when callback config is unavailable", async () => {
  const originals = {
    fetch: global.fetch,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const fetchCalls = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => data;
  prisma.appSetting.findMany = async () => [];
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
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  delete process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
  process.env.APP_BASE_URL = "https://writer.example.test";

  const service = new AutoDirectorFollowUpNotificationService();

  try {
    await service.handleTaskTransition({
      before: buildWorkflowRow({
        status: "running",
        checkpointType: null,
        checkpointSummary: null,
        currentItemLabel: "正在执行前 10 章",
        updatedAt: new Date("2026-04-22T09:55:00.000Z"),
      }),
      after: buildWorkflowRow({
        status: "waiting_approval",
        checkpointType: "front10_ready",
        checkpointSummary: "前 10 章已准备完成。",
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
      }),
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.channelType, "dingtalk");
    assert.deepEqual(
      fetchCalls[0].body.card.actions.map((item) => ({ kind: item.kind, actionCode: item.actionCode })),
      [
        { kind: "link", actionCode: "open_detail" },
        { kind: "link", actionCode: "open_follow_up_center" },
      ],
    );
  } finally {
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    global.fetch = originals.fetch;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
  }
});

test("auto director follow-up notification service skips progress_changed by default but can send it when subscribed", async () => {
  const originals = {
    fetch: global.fetch,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const fetchCalls = [];
  const notifications = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => {
    notifications.push(data);
    return data;
  };
  prisma.appSetting.findMany = async () => [];
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
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_DINGTALK_EVENT_TYPES: process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN,
    AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON,
    APP_BASE_URL: process.env.APP_BASE_URL,
  };
  process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = "https://relay.example.test/dingtalk";
  process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = "ding-callback-token";
  process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = JSON.stringify({
    ding_user_1: "user_1",
  });
  delete process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES;
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
  process.env.APP_BASE_URL = "https://writer.example.test";

  const service = new AutoDirectorFollowUpNotificationService();
  const before = buildWorkflowRow({
    status: "waiting_approval",
    currentStage: "章节细化",
    progress: 0.62,
    checkpointType: "front10_ready",
    checkpointSummary: "前 10 章已准备完成。",
    updatedAt: new Date("2026-04-22T09:55:00.000Z"),
  });
  const after = buildWorkflowRow({
    status: "waiting_approval",
    currentStage: "章节执行",
    progress: 0.74,
    checkpointType: "front10_ready",
    checkpointSummary: "前 10 章已准备完成。",
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
  });

  try {
    await service.handleTaskTransition({
      before,
      after,
    });
    assert.equal(fetchCalls.length, 0);
    assert.equal(notifications.length, 0);

    process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES = "auto_director.progress_changed";

    await service.handleTaskTransition({
      before,
      after,
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.event.eventType, "auto_director.progress_changed");
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].eventType, "auto_director.progress_changed");
  } finally {
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    global.fetch = originals.fetch;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES = previousEnv.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
  }
});

test("auto director follow-up notification service prefers saved baseUrl when building follow-up links", async () => {
  const originals = {
    fetch: global.fetch,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const fetchCalls = [];

  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => data;
  prisma.appSetting.findMany = async () => ([
    {
      key: "autoDirector.baseUrl",
      value: "https://book.example.test",
    },
    {
      key: "autoDirector.channels.dingtalk.webhookUrl",
      value: "https://relay.example.test/dingtalk",
    },
    {
      key: "autoDirector.channels.dingtalk.callbackToken",
      value: "ding-callback-token",
    },
    {
      key: "autoDirector.channels.dingtalk.operatorMapJson",
      value: JSON.stringify({
        ding_user_1: "user_1",
      }),
    },
  ]);
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
    APP_BASE_URL: process.env.APP_BASE_URL,
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN,
    AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_DINGTALK_EVENT_TYPES: process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN: process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN,
    AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON: process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON,
    AUTO_DIRECTOR_WECOM_EVENT_TYPES: process.env.AUTO_DIRECTOR_WECOM_EVENT_TYPES,
  };
  process.env.APP_BASE_URL = "https://api-only.example.test";
  delete process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
  delete process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES;
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
  delete process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
  delete process.env.AUTO_DIRECTOR_WECOM_EVENT_TYPES;

  const service = new AutoDirectorFollowUpNotificationService();

  try {
    await service.handleTaskTransition({
      before: buildWorkflowRow({
        status: "running",
        checkpointType: null,
        checkpointSummary: null,
        currentItemLabel: "正在执行前 10 章",
        updatedAt: new Date("2026-04-22T09:55:00.000Z"),
      }),
      after: buildWorkflowRow({
        status: "waiting_approval",
        checkpointType: "front10_ready",
        checkpointSummary: "前 10 章已准备完成。",
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
      }),
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://relay.example.test/dingtalk");
    assert.equal(
      fetchCalls[0].body.card.actions.at(-1).url,
      "https://book.example.test/auto-director/follow-ups?taskId=task_front10",
    );
    assert.equal(
      fetchCalls[0].body.card.actions[0].callback.endpoint,
      "https://book.example.test/api/auto-director/channel-callbacks/dingtalk",
    );
  } finally {
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    global.fetch = originals.fetch;
    process.env.APP_BASE_URL = previousEnv.APP_BASE_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES = previousEnv.AUTO_DIRECTOR_DINGTALK_EVENT_TYPES;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN = previousEnv.AUTO_DIRECTOR_WECOM_CALLBACK_TOKEN;
    process.env.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON = previousEnv.AUTO_DIRECTOR_WECOM_OPERATOR_MAP_JSON;
    process.env.AUTO_DIRECTOR_WECOM_EVENT_TYPES = previousEnv.AUTO_DIRECTOR_WECOM_EVENT_TYPES;
  }
});
