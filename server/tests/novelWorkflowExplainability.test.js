const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWorkflowExplainability } = require("../dist/services/task/novelWorkflowExplainability.js");

test("workflow explainability exposes chapter-batch readiness for the default 1-10 range", () => {
  const result = buildWorkflowExplainability({
    status: "waiting_approval",
    currentStage: "chapter_execution",
    currentItemKey: "chapter_execution",
    checkpointType: "chapter_batch_ready",
    lastError: null,
  });

  assert.match(result.displayStatus, /1-10/);
  assert.match(result.resumeAction, /1-10/);
  assert.ok(result.blockingReason?.includes("1-10"));
  assert.equal(result.lastHealthyStage, "节奏 / 拆章");
});

test("workflow explainability exposes recovery guidance for a failed chapter batch", () => {
  const result = buildWorkflowExplainability({
    status: "failed",
    currentStage: "quality_repair",
    currentItemKey: "quality_repair",
    checkpointType: "chapter_batch_ready",
    lastError: "chapter 3 still needs repair",
  });

  assert.match(result.displayStatus, /1-10/);
  assert.match(result.resumeAction, /1-10/);
  assert.equal(result.lastHealthyStage, "章节执行");
  assert.ok(result.blockingReason);
});

test("workflow explainability uses the actual chapter range scope", () => {
  const result = buildWorkflowExplainability({
    status: "waiting_approval",
    currentStage: "chapter_execution",
    currentItemKey: "chapter_execution",
    checkpointType: "chapter_batch_ready",
    executionScopeLabel: "第 11-20 章",
    lastError: null,
  });

  assert.match(result.displayStatus, /11-20/);
  assert.match(result.resumeAction, /11-20/);
  assert.ok(result.blockingReason?.includes("11-20"));
});

test("workflow explainability treats restart recovery as recovery-in-progress", () => {
  const result = buildWorkflowExplainability({
    status: "running",
    currentStage: "节奏 / 拆章",
    currentItemKey: "beat_sheet",
    checkpointType: null,
    lastError: "service restarted and recovery is in progress",
  });

  assert.equal(result.displayStatus, "节奏 / 拆章进行中");
  assert.equal(result.resumeAction, "查看当前进度");
  assert.equal(result.lastHealthyStage, "节奏 / 拆章");
  assert.equal(result.blockingReason, null);
});
