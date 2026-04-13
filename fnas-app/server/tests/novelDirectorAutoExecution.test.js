const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorAutoExecutionPipelineOptions,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionWorkflowState,
} = require("../dist/services/novel/director/novelDirectorAutoExecution.js");

test("resolveDirectorAutoExecutionRange sorts chapters and limits to front 10", () => {
  const range = resolveDirectorAutoExecutionRange([
    { id: "chapter-12", order: 12 },
    { id: "chapter-3", order: 3 },
    { id: "chapter-1", order: 1 },
    { id: "chapter-11", order: 11 },
    { id: "chapter-7", order: 7 },
    { id: "chapter-9", order: 9 },
    { id: "chapter-2", order: 2 },
    { id: "chapter-5", order: 5 },
    { id: "chapter-8", order: 8 },
    { id: "chapter-4", order: 4 },
    { id: "chapter-6", order: 6 },
    { id: "chapter-10", order: 10 },
  ]);

  assert.deepEqual(range, {
    startOrder: 1,
    endOrder: 10,
    totalChapterCount: 10,
    firstChapterId: "chapter-1",
  });
});

test("buildDirectorAutoExecutionPipelineOptions uses front10-safe defaults", () => {
  const options = buildDirectorAutoExecutionPipelineOptions({
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.6,
    startOrder: 1,
    endOrder: 10,
  });

  assert.equal(options.runMode, "fast");
  assert.equal(options.autoReview, true);
  assert.equal(options.autoRepair, true);
  assert.equal(options.skipCompleted, true);
  assert.equal(options.qualityThreshold, 75);
  assert.equal(options.repairMode, "light_repair");
});

test("resolveDirectorAutoExecutionWorkflowState maps review and repair into quality repair stage", () => {
  const range = {
    startOrder: 1,
    endOrder: 10,
    totalChapterCount: 10,
    firstChapterId: "chapter-1",
  };

  const reviewingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.5,
    currentStage: "reviewing",
    currentItemLabel: "第3章",
  }, range);
  assert.equal(reviewingState.stage, "quality_repair");
  assert.equal(reviewingState.itemKey, "quality_repair");
  assert.match(reviewingState.itemLabel, /自动审校前 10 章/);

  const repairingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.5,
    currentStage: "repairing",
    currentItemLabel: "第4章",
  }, range);
  assert.equal(repairingState.stage, "quality_repair");
  assert.equal(repairingState.itemKey, "quality_repair");
  assert.match(repairingState.itemLabel, /自动修复前 10 章/);

  const draftingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.25,
    currentStage: "generating",
    currentItemLabel: "第2章",
  }, range);
  assert.equal(draftingState.stage, "chapter_execution");
  assert.equal(draftingState.itemKey, "chapter_execution");
  assert.match(draftingState.itemLabel, /自动执行前 10 章/);
});
