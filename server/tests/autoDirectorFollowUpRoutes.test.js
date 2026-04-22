const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { AutoDirectorFollowUpService } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.js");
const { AutoDirectorFollowUpActionExecutor } = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("auto director follow-up routes expose overview, list, detail, and action endpoints", async () => {
  const originals = {
    getOverview: AutoDirectorFollowUpService.prototype.getOverview,
    list: AutoDirectorFollowUpService.prototype.list,
    getDetail: AutoDirectorFollowUpService.prototype.getDetail,
    execute: AutoDirectorFollowUpActionExecutor.prototype.execute,
    executeBatch: AutoDirectorFollowUpActionExecutor.prototype.executeBatch,
  };
  const calls = [];

  AutoDirectorFollowUpService.prototype.getOverview = async function getOverviewMock() {
    return {
      totalCount: 3,
      countersByReason: {
        manual_recovery_required: 0,
        runtime_failed: 1,
        candidate_selection_required: 0,
        replan_required: 1,
        runtime_cancelled: 0,
        front10_execution_pending: 1,
        quality_repair_pending: 0,
      },
    };
  };
  AutoDirectorFollowUpService.prototype.list = async function listMock(input) {
    calls.push(["list", input]);
    return {
      items: [{
        taskId: "task_1",
        novelId: "novel_1",
        novelTitle: "《雾港巡夜人》",
        taskTitle: "AI 自动导演",
        lane: "auto_director",
        status: "waiting_approval",
        currentStage: "章节执行",
        checkpointType: "front10_ready",
        reason: "front10_execution_pending",
        reasonLabel: "自动执行待继续",
        priority: "P2",
        followUpSummary: "前 10 章已准备完成。",
        blockingReason: null,
        executionScope: "前 10 章",
        currentModel: "anthropic/claude-sonnet-4-6",
        availableActions: [],
        batchActionCodes: ["continue_auto_execution"],
        supportsBatch: true,
        channelCapabilities: {
          dingtalk: true,
          wecom: true,
        },
        pendingManualRecovery: false,
        lastMilestoneAt: "2026-04-22T08:00:00.000Z",
        updatedAt: "2026-04-22T08:05:00.000Z",
      }],
      countersByReason: {
        manual_recovery_required: 0,
        runtime_failed: 0,
        candidate_selection_required: 0,
        replan_required: 0,
        runtime_cancelled: 0,
        front10_execution_pending: 1,
        quality_repair_pending: 0,
      },
      summaryCounters: {
        recoveredToday: 1,
        completedToday: 0,
      },
      availableFilters: {
        reasons: ["front10_execution_pending"],
        statuses: ["waiting_approval"],
        channelTypes: ["dingtalk", "wecom"],
      },
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
      },
    };
  };
  AutoDirectorFollowUpService.prototype.getDetail = async function getDetailMock(taskId) {
    calls.push(["detail", taskId]);
    return {
      taskId,
      checkpointSummary: "前 10 章已准备完成。",
      blockingReason: null,
      currentModel: "anthropic/claude-sonnet-4-6",
      riskNote: null,
      originDetailUrl: `/tasks?kind=novel_workflow&id=${taskId}`,
      replanUrl: null,
      candidateSelectionUrl: null,
      availableActions: [],
      milestones: [],
      task: {
        id: taskId,
        kind: "novel_workflow",
        title: "AI 自动导演",
        status: "waiting_approval",
      },
    };
  };
  AutoDirectorFollowUpActionExecutor.prototype.execute = async function executeMock(input) {
    calls.push(["execute", input]);
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
  AutoDirectorFollowUpActionExecutor.prototype.executeBatch = async function executeBatchMock(input) {
    calls.push(["batch", input]);
    return {
      code: "partial_success",
      successCount: 1,
      failureCount: 0,
      skippedCount: 1,
      itemResults: [{
        taskId: "task_1",
        actionCode: input.actionCode,
        code: "executed",
        message: "执行成功",
      }, {
        taskId: "task_2",
        actionCode: input.actionCode,
        code: "state_changed",
        message: "状态已变化",
      }],
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/auto-director/follow-ups/overview`);
    assert.equal(overviewResponse.status, 200);
    const overviewPayload = await overviewResponse.json();
    assert.equal(overviewPayload.success, true);
    assert.equal(overviewPayload.data.totalCount, 3);

    const listResponse = await fetch(
      `http://127.0.0.1:${port}/api/auto-director/follow-ups?reason=front10_execution_pending&supportsBatch=true&page=1&pageSize=20`,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.success, true);
    assert.equal(listPayload.data.items[0].taskId, "task_1");

    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/auto-director/follow-ups/task_1`);
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.success, true);
    assert.equal(detailPayload.data.taskId, "task_1");

    const actionResponse = await fetch(`http://127.0.0.1:${port}/api/auto-director/follow-ups/task_1/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionCode: "continue_auto_execution",
        idempotencyKey: "route-k1",
      }),
    });
    assert.equal(actionResponse.status, 200);
    const actionPayload = await actionResponse.json();
    assert.equal(actionPayload.success, true);
    assert.equal(actionPayload.data.code, "executed");

    const batchResponse = await fetch(`http://127.0.0.1:${port}/api/auto-director/follow-ups/batch-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionCode: "retry_with_task_model",
        taskIds: ["task_1", "task_2"],
        batchRequestKey: "route-batch-k1",
      }),
    });
    assert.equal(batchResponse.status, 200);
    const batchPayload = await batchResponse.json();
    assert.equal(batchPayload.success, true);
    assert.equal(batchPayload.data.code, "partial_success");

    assert.deepEqual(calls, [
      ["list", {
        reason: "front10_execution_pending",
        supportsBatch: true,
        page: 1,
        pageSize: 20,
      }],
      ["detail", "task_1"],
      ["execute", {
        taskId: "task_1",
        actionCode: "continue_auto_execution",
        source: "web",
        operatorId: "anonymous",
        idempotencyKey: "route-k1",
      }],
      ["batch", {
        actionCode: "retry_with_task_model",
        taskIds: ["task_1", "task_2"],
        source: "web",
        operatorId: "anonymous",
        batchRequestKey: "route-batch-k1",
      }],
    ]);
  } finally {
    AutoDirectorFollowUpService.prototype.getOverview = originals.getOverview;
    AutoDirectorFollowUpService.prototype.list = originals.list;
    AutoDirectorFollowUpService.prototype.getDetail = originals.getDetail;
    AutoDirectorFollowUpActionExecutor.prototype.execute = originals.execute;
    AutoDirectorFollowUpActionExecutor.prototype.executeBatch = originals.executeBatch;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
