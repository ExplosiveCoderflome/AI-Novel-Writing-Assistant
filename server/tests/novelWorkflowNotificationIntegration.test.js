const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

function buildAutoDirectorTask(overrides = {}) {
  return {
    id: "task_workflow_notify",
    novelId: "novel_notify",
    lane: "auto_director",
    title: "AI 自动导演",
    status: "running",
    progress: 0.68,
    currentStage: "章节执行",
    currentItemKey: "pipeline_execution",
    currentItemLabel: "正在执行前 10 章",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        scopeLabel: "前 10 章",
      },
    }),
    pendingManualRecovery: false,
    lastError: null,
    cancelRequestedAt: null,
    startedAt: new Date("2026-04-26T09:55:00.000Z"),
    finishedAt: null,
    heartbeatAt: new Date("2026-04-26T09:56:00.000Z"),
    updatedAt: new Date("2026-04-26T09:56:00.000Z"),
    novel: {
      title: "《雾港巡夜人》",
    },
    ...overrides,
  };
}

test("markTaskWaitingApproval delivers WeCom notification for auto director approval-required transitions", async () => {
  const originals = {
    fetch: global.fetch,
    archiveFindUnique: prisma.taskCenterArchive.findUnique,
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
    appSettingFindMany: prisma.appSetting.findMany,
    notificationLogCreate: prisma.autoDirectorFollowUpNotificationLog.create,
  };
  const before = buildAutoDirectorTask();
  const notifications = [];
  const fetchCalls = [];

  prisma.taskCenterArchive.findUnique = async () => null;
  prisma.novelWorkflowTask.findUnique = async () => before;
  prisma.novelWorkflowTask.update = async ({ data, include }) => {
    assert.deepEqual(include, {
      novel: {
        select: {
          title: true,
        },
      },
    });
    return buildAutoDirectorTask({
      ...data,
      updatedAt: new Date("2026-04-26T10:00:00.000Z"),
    });
  };
  prisma.appSetting.findMany = async () => [
    {
      key: "autoDirector.baseUrl",
      value: "https://writer.example.test",
    },
    {
      key: "autoDirector.channels.wecom.webhookUrl",
      value: "https://relay.example.test/wecom",
    },
    {
      key: "autoDirector.channels.wecom.callbackToken",
      value: "",
    },
    {
      key: "autoDirector.channels.wecom.operatorMapJson",
      value: "{}",
    },
    {
      key: "autoDirector.channels.wecom.eventTypes",
      value: "auto_director.approval_required,auto_director.exception,auto_director.completed",
    },
  ];
  prisma.autoDirectorFollowUpNotificationLog.create = async ({ data }) => {
    notifications.push(data);
    return data;
  };
  global.fetch = async (url, init) => {
    fetchCalls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  try {
    const service = new NovelWorkflowService();
    await service.markTaskWaitingApproval("task_workflow_notify", {
      stage: "chapter_execution",
      itemKey: "chapter_execution",
      itemLabel: "等待继续自动执行",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progress: 0.72,
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://relay.example.test/wecom");
    assert.equal(fetchCalls[0].method, "POST");
    assert.equal(fetchCalls[0].body.msgtype, "markdown");
    assert.match(fetchCalls[0].body.markdown.content, /自动导演跟进提醒/);
    assert.match(fetchCalls[0].body.markdown.content, /前 10 章已准备完成。/);

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].channelType, "wecom");
    assert.equal(notifications[0].eventType, "auto_director.approval_required");
    assert.equal(notifications[0].taskId, "task_workflow_notify");
    assert.equal(notifications[0].status, "delivered");
    assert.equal(notifications[0].responseStatus, 200);
  } finally {
    global.fetch = originals.fetch;
    prisma.taskCenterArchive.findUnique = originals.archiveFindUnique;
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    prisma.autoDirectorFollowUpNotificationLog.create = originals.notificationLogCreate;
  }
});
