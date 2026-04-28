const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorEventProjectionService,
} = require("../dist/services/novel/director/runtime/DirectorEventProjectionService.js");

function buildSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: "task-1",
    novelId: "novel-1",
    entrypoint: "confirm",
    policy: {
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

test("director event projection marks approval gates as user action", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:chapter_execution_node:novel:novel-1",
      nodeKey: "chapter_execution_node",
      label: "执行章节生成批次",
      status: "waiting_approval",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
      policyDecision: {
        canRun: false,
        requiresApproval: true,
        reason: "当前策略需要确认后继续。",
        mayOverwriteUserContent: false,
        affectedArtifacts: [],
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      },
    }],
    events: [{
      eventId: "event-1",
      type: "approval_required",
      taskId: "task-1",
      novelId: "novel-1",
      nodeKey: "chapter_execution_node",
      summary: "章节执行等待确认。",
      occurredAt: "2026-04-28T00:00:02.000Z",
    }],
  }));

  assert.equal(projection.status, "waiting_approval");
  assert.equal(projection.requiresUserAction, true);
  assert.equal(projection.currentNodeKey, "chapter_execution_node");
  assert.equal(projection.blockedReason, "当前策略需要确认后继续。");
  assert.equal(projection.recentEvents.length, 1);
});

test("director event projection keeps latest event first", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:story_macro_phase:novel:novel-1",
      nodeKey: "story_macro_phase",
      label: "生成书级规划资产",
      status: "succeeded",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
      finishedAt: "2026-04-28T00:00:03.000Z",
    }],
    events: [
      {
        eventId: "event-old",
        type: "node_started",
        summary: "开始生成书级规划资产。",
        occurredAt: "2026-04-28T00:00:01.000Z",
      },
      {
        eventId: "event-new",
        type: "node_completed",
        summary: "书级规划资产已准备好。",
        occurredAt: "2026-04-28T00:00:03.000Z",
      },
    ],
  }));

  assert.equal(projection.status, "completed");
  assert.equal(projection.requiresUserAction, false);
  assert.equal(projection.lastEventSummary, "书级规划资产已准备好。");
  assert.equal(projection.recentEvents[0].eventId, "event-new");
});
