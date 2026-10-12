const assert = require("node:assert/strict");
const test = require("node:test");

const {
  recordUsageAnomalySignal,
} = require("../dist/services/novel/director/runtime/DirectorCircuitBreakerService.js");
const {
  buildFailureCircuitBreaker,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionCircuitBreakerRuntime.js");

test("pipeline failures remain runtime failures when automatic repair is enabled", () => {
  const state = buildFailureCircuitBreaker({
    autoExecution: {
      autoRepair: true,
      nextChapterId: "chapter-1",
      nextChapterOrder: 1,
      circuitBreaker: null,
    },
    jobStatus: "failed",
    message: "模型服务暂时不可用。",
  });

  assert.equal(state.reason, "service_unavailable");
  assert.equal(state.patchFailureCount, 0);
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
