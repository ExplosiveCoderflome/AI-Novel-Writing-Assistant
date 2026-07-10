const test = require("node:test");
const assert = require("node:assert/strict");

const {
  schedulePendingReviewAutoPromotionIfEnabled,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionRuntime.js");

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("pending review auto-promotion scheduler does not call service when disabled", async () => {
  let calls = 0;

  schedulePendingReviewAutoPromotionIfEnabled({
    isPendingReviewAutoPromotionEnabled: async () => false,
    autoPromotePendingReviewProposals: async () => {
      calls += 1;
    },
  }, {
    novelId: "novel-1",
    taskId: "task-1",
  });
  await flushMicrotasks();

  assert.equal(calls, 0);
});

test("pending review auto-promotion scheduler calls service when enabled", async () => {
  const calls = [];

  schedulePendingReviewAutoPromotionIfEnabled({
    isPendingReviewAutoPromotionEnabled: () => true,
    autoPromotePendingReviewProposals: async (input) => {
      calls.push(input);
    },
  }, {
    novelId: "novel-1",
    taskId: "task-1",
  });
  await flushMicrotasks();

  assert.deepEqual(calls, [{
    novelId: "novel-1",
    taskId: "task-1",
  }]);
});

