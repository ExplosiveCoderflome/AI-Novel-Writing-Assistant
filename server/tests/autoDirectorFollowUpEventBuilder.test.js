const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAutoDirectorEvent,
  deriveAutoDirectorFollowUpState,
  detectAutoDirectorEventType,
} = require("../dist/services/task/autoDirectorFollowUps/autoDirectorFollowUpEventBuilder.js");

test("auto director event builder marks progress_changed when follow-up stage changes within the same reason", () => {
  const eventType = detectAutoDirectorEventType({
    before: {
      taskId: "task_1",
      novelId: "novel_1",
      novelTitle: "《雾港巡夜人》",
      summary: "前 10 章已准备完成。",
      reason: "front10_execution_pending",
      reasonLabel: "自动执行待继续",
      availableMutationActions: ["continue_auto_execution"],
      stage: "章节细化",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progressBucket: 8,
      executionScopeLabel: "前 10 章",
    },
    after: {
      taskId: "task_1",
      novelId: "novel_1",
      novelTitle: "《雾港巡夜人》",
      summary: "前 10 章已准备完成。",
      reason: "front10_execution_pending",
      reasonLabel: "自动执行待继续",
      availableMutationActions: ["continue_auto_execution"],
      stage: "章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progressBucket: 8,
      executionScopeLabel: "前 10 章",
    },
    afterStatus: "waiting_approval",
  });

  assert.equal(eventType, "auto_director.progress_changed");
});

test("auto director event builder marks progress_changed when progress crosses a 10 percent bucket", () => {
  const eventType = detectAutoDirectorEventType({
    before: {
      taskId: "task_2",
      novelId: "novel_2",
      novelTitle: "《北城不眠夜》",
      summary: "正在继续自动执行。",
      reason: "front10_execution_pending",
      reasonLabel: "自动执行待继续",
      availableMutationActions: ["continue_auto_execution"],
      stage: "章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progressBucket: 6,
      executionScopeLabel: "第 11-20 章",
    },
    after: {
      taskId: "task_2",
      novelId: "novel_2",
      novelTitle: "《北城不眠夜》",
      summary: "正在继续自动执行。",
      reason: "front10_execution_pending",
      reasonLabel: "自动执行待继续",
      availableMutationActions: ["continue_auto_execution"],
      stage: "章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progressBucket: 7,
      executionScopeLabel: "第 11-20 章",
    },
    afterStatus: "waiting_approval",
  });

  assert.equal(eventType, "auto_director.progress_changed");
});

test("auto director event builder emits approval when auto progress reaches a user action", () => {
  const eventType = detectAutoDirectorEventType({
    before: {
      taskId: "task_3",
      novelId: "novel_3",
      novelTitle: "《雾港巡夜人》",
      summary: "正在执行前 10 章",
      reason: "auto_progress_running",
      reasonLabel: "自动推进中",
      availableMutationActions: [],
      stage: "章节执行",
      checkpointType: null,
      checkpointSummary: null,
      progressBucket: 8,
      executionScopeLabel: "前 10 章",
    },
    after: {
      taskId: "task_3",
      novelId: "novel_3",
      novelTitle: "《雾港巡夜人》",
      summary: "前 10 章已准备完成。",
      reason: "front10_execution_pending",
      reasonLabel: "自动执行待继续",
      availableMutationActions: ["continue_auto_execution"],
      stage: "章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "前 10 章已准备完成。",
      progressBucket: 9,
      executionScopeLabel: "前 10 章",
    },
    afterStatus: "waiting_approval",
  });

  assert.equal(eventType, "auto_director.approval_required");
});

test("auto director event builder builds auto-approved audit events", () => {
  const event = buildAutoDirectorEvent({
    eventType: "auto_director.auto_approved",
    after: {
      taskId: "task_auto_approved",
      novelId: "novel_auto_approved",
      novelTitle: "《雾港巡夜人》",
      summary: "AI 已自动通过角色准备，并继续推进。",
      reason: "auto_approval_completed",
      reasonLabel: "最近自动通过",
      availableMutationActions: [],
      stage: "character_setup",
      checkpointType: "character_setup_required",
      checkpointSummary: "角色准备已生成并应用。",
      progressBucket: null,
      executionScopeLabel: "全书",
    },
    occurredAt: new Date("2026-04-22T10:30:00.000Z"),
  });

  assert.equal(event.eventType, "auto_director.auto_approved");
  assert.equal(event.reason, "auto_approval_completed");
  assert.deepEqual(event.actionCandidates, []);
  assert.equal(event.summary, "AI 已自动通过角色准备，并继续推进。");
});

test("auto director event builder exposes validation-required state without mutation actions", () => {
  const state = deriveAutoDirectorFollowUpState({
    id: "task_validation",
    novelId: "novel_1",
    status: "waiting_approval",
    progress: 0.8,
    currentStage: "章节执行",
    checkpointType: "front10_ready",
    checkpointSummary: "第 1-10 章等待继续。",
    currentItemLabel: "等待继续自动执行",
    pendingManualRecovery: false,
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        scopeLabel: "第 1-10 章",
      },
      autoDirectorValidationResult: {
        allowed: false,
        blockingReasons: ["目标范围缺少节奏拆章，需要先重新校验。"],
        warnings: [],
        requiredActions: [],
        affectedScope: {
          type: "chapter_range",
          label: "第 1-10 章",
          startOrder: 1,
          endOrder: 10,
        },
        nextAction: "revalidate",
      },
    }),
    novel: {
      title: "《雾港巡夜人》",
    },
  });

  assert.ok(state);
  assert.equal(state.reason, "validation_required");
  assert.equal(state.reasonLabel, "需要重新校验");
  assert.deepEqual(state.availableMutationActions, []);
});
