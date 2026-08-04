const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isDirectorCircuitBreakerOpen,
  recordPatchFailureSignal,
  recordReplanLoopSignal,
  recordUsageAnomalySignal,
} = require("../../dist/services/novel/director/runtime/DirectorCircuitBreakerService.js");

test("director circuit breaker opens after repeated patch failures on the same chapter", () => {
  let state = null;
  state = recordPatchFailureSignal({
    previous: state,
    chapterId: "chapter-1",
    chapterOrder: 1,
    message: "局部补丁未能安全应用。",
  });
  assert.equal(state.status, "closed");
  assert.equal(state.patchFailureCount, 1);

  state = recordPatchFailureSignal({
    previous: state,
    chapterId: "chapter-1",
    chapterOrder: 1,
    message: "局部补丁仍未能安全应用。",
  });
  assert.equal(state.status, "closed");
  assert.equal(state.patchFailureCount, 2);

  state = recordPatchFailureSignal({
    previous: state,
    chapterId: "chapter-1",
    chapterOrder: 1,
    message: "同一章节连续修复失败。",
  });
  assert.equal(isDirectorCircuitBreakerOpen(state), true);
  assert.equal(state.reason, "auto_repair_exhausted");
  assert.equal(state.recoveryAction, "manual_repair");
});

test("director circuit breaker opens after repeated replan loops", () => {
  let state = null;
  for (let index = 0; index < 3; index += 1) {
    state = recordReplanLoopSignal({
      previous: state,
      chapterId: "chapter-2",
      chapterOrder: 2,
      message: "重规划后仍回到同一阻断。",
    });
  }

  assert.equal(state.status, "open");
  assert.equal(state.reason, "replan_loop");
  assert.equal(state.replanLoopCount, 3);
});

test("usage anomaly ignores the same usage record twice", () => {
  let state = recordUsageAnomalySignal({
    previous: null,
    usageRecordId: "usage-1",
    totalTokens: 180000,
    nodeKey: "chapter_execution_node",
  });
  assert.equal(state.status, "closed");
  assert.equal(state.usageAnomalyCount, 1);

  state = recordUsageAnomalySignal({
    previous: state,
    usageRecordId: "usage-1",
    totalTokens: 180000,
    nodeKey: "chapter_execution_node",
  });
  assert.equal(state.status, "closed");
  assert.equal(state.usageAnomalyCount, 1);

  state = recordUsageAnomalySignal({
    previous: state,
    usageRecordId: "usage-2",
    totalTokens: 180000,
    nodeKey: "chapter_execution_node",
  });
  assert.equal(state.status, "open");
  assert.equal(state.reason, "usage_anomaly");
});
