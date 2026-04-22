const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
