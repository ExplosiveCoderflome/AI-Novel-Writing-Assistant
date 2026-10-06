const test = require("node:test");
const assert = require("node:assert/strict");

const takeoverRuntime = require("../dist/services/novel/director/runtime/novelDirectorTakeoverRuntime.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");

test("startTakeover resolves the predecessor when its command has already created a replacement task", { concurrency: false }, async () => {
  const originalLoadState = takeoverRuntime.loadDirectorTakeoverState;
  const previousTask = {
    id: "previous-cancelled-task",
    status: "cancelled",
    seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
  };
  const calls = [];
  const service = new NovelDirectorService();
  service.workflowService = {
    findActiveDirectorTask: async (novelId) => {
      calls.push(["active", novelId]);
      return { id: "replacement-task", status: "queued" };
    },
    resolveCurrentDirectorTask: async (novelId) => {
      calls.push(["current", novelId]);
      return { id: "replacement-task", status: "queued" };
    },
    resolvePreviousDirectorTask: async (novelId, excludeTaskId) => {
      calls.push(["previous", novelId, excludeTaskId]);
      return previousTask;
    },
  };
  takeoverRuntime.loadDirectorTakeoverState = async (input) => {
    const [activeTask, latestTask] = await Promise.all([
      input.findActiveAutoDirectorTask("novel-1"),
      input.findLatestAutoDirectorTask("novel-1"),
    ]);
    assert.equal(activeTask, null);
    assert.equal(latestTask, previousTask);
    throw new Error("stop after loading takeover context");
  };

  try {
    await assert.rejects(
      service.startTakeover({ novelId: "novel-1" }, { workflowTaskId: "replacement-task" }),
      /stop after loading takeover context/,
    );
    assert.deepEqual(calls, [
      ["active", "novel-1"],
      ["previous", "novel-1", "replacement-task"],
    ]);
  } finally {
    takeoverRuntime.loadDirectorTakeoverState = originalLoadState;
  }
});
