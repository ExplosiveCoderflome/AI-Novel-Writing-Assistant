const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWorkflowExplainability } = require("../dist/services/task/novelWorkflowExplainability.js");

test("workflow explainability exposes blocking reason and last healthy stage for front10 readiness", () => {
  const result = buildWorkflowExplainability({
    status: "waiting_approval",
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    checkpointType: "front10_ready",
    lastError: null,
  });

  assert.equal(result.displayStatus, "前 10 章已可进入章节执行");
  assert.equal(result.resumeAction, "继续自动执行前 10 章");
  assert.equal(result.lastHealthyStage, "节奏 / 拆章");
  assert.match(result.blockingReason, /前 10 章细化已准备完成/);
});

test("workflow explainability exposes recovery guidance for failed chapter batch execution", () => {
  const result = buildWorkflowExplainability({
    status: "failed",
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    checkpointType: "chapter_batch_ready",
    lastError: "第 3 章修复后仍未达标",
  });

  assert.equal(result.displayStatus, "前 10 章自动执行已暂停");
  assert.equal(result.resumeAction, "继续自动执行剩余章节");
  assert.equal(result.lastHealthyStage, "章节执行");
  assert.match(result.blockingReason, /批量阶段中断/);
});

test("workflow explainability treats restart recovery as running recovery instead of failure", () => {
  const result = buildWorkflowExplainability({
    status: "running",
    currentStage: "节奏 / 拆章",
    currentItemKey: "beat_sheet",
    checkpointType: null,
    lastError: "自动导演任务因服务重启中断，正在尝试恢复。",
  });

  assert.equal(result.displayStatus, "节奏 / 拆章恢复中");
  assert.equal(result.resumeAction, "查看当前进度");
  assert.equal(result.lastHealthyStage, "节奏 / 拆章");
  assert.equal(result.blockingReason, "自动导演任务因服务重启中断，正在尝试恢复。");
});
