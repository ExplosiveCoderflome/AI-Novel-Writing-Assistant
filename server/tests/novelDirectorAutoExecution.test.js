const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorAutoExecutionState,
  buildDirectorAutoExecutionScopeLabel,
  buildDirectorAutoExecutionPipelineOptions,
  isDirectorAutoExecutionChapterProcessed,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionWorkflowState,
} = require("../dist/services/novel/director/novelDirectorAutoExecution.js");

test("front10 normalizes to the explicit chapter range 1-10", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "front10" }), {
    mode: "front10",
    startOrder: 1,
    endOrder: 10,
    autoReview: true,
    autoRepair: true,
  });
});

test("front10 can carry a user-selected front N chapter range", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "front10", endOrder: 25 }), {
    mode: "front10",
    startOrder: 1,
    endOrder: 25,
    autoReview: true,
    autoRepair: true,
  });

  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "front10",
    endOrder: 25,
  }), "前 25 章");
});

test("book auto execution normalizes to full-book scope without chapter bounds", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "book" }), {
    mode: "book",
    autoReview: true,
    autoRepair: true,
  });

  assert.equal(buildDirectorAutoExecutionScopeLabel({ mode: "book" }), "全书");
});

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
  assert.equal(options.maxRetries, 1);
  assert.equal(options.autoReview, true);
  assert.equal(options.autoRepair, true);
  assert.equal(options.skipCompleted, true);
  assert.equal(options.qualityThreshold, 75);
  assert.equal(options.repairMode, "light_repair");
  assert.equal(options.controlPolicy?.kickoffMode, "director_start");
  assert.equal(options.controlPolicy?.advanceMode, "auto_to_execution");
});

test("buildDirectorAutoExecutionPipelineOptions respects review and repair toggles", () => {
  const options = buildDirectorAutoExecutionPipelineOptions({
    startOrder: 11,
    endOrder: 20,
    autoReview: false,
    autoRepair: true,
  });

  assert.equal(options.autoReview, false);
  assert.equal(options.autoRepair, false);
});

test("auto execution does not treat empty reviewed chapters as processed", () => {
  const emptyReviewedChapter = {
    id: "chapter-empty",
    order: 11,
    content: "",
    generationState: "reviewed",
    chapterStatus: "pending_review",
  };
  const draftedReviewedChapter = {
    id: "chapter-drafted",
    order: 12,
    content: "正文内容",
    generationState: "reviewed",
    chapterStatus: "pending_review",
  };

  assert.equal(isDirectorAutoExecutionChapterProcessed(emptyReviewedChapter), false);
  assert.equal(isDirectorAutoExecutionChapterProcessed(draftedReviewedChapter), true);

  const state = buildDirectorAutoExecutionState({
    range: {
      startOrder: 11,
      endOrder: 12,
      totalChapterCount: 2,
      firstChapterId: "chapter-empty",
    },
    chapters: [emptyReviewedChapter, draftedReviewedChapter],
    plan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 12,
    },
  });

  assert.equal(state.completedChapterCount, 1);
  assert.equal(state.remainingChapterCount, 1);
  assert.deepEqual(state.remainingChapterOrders, [11]);
});

test("auto execution state discards stale skips for chapters that still need generation", () => {
  const state = buildDirectorAutoExecutionState({
    range: {
      startOrder: 5,
      endOrder: 7,
      totalChapterCount: 3,
      firstChapterId: "chapter-5",
    },
    chapters: [
      { id: "chapter-5", order: 5, content: "正文5", generationState: "approved" },
      { id: "chapter-6", order: 6, content: "", generationState: "planned" },
      { id: "chapter-7", order: 7, content: "正文7", generationState: "approved" },
    ],
    plan: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 5,
      endOrder: 7,
      skippedChapterIds: ["chapter-6"],
      skippedChapterOrders: [6],
    },
  });

  assert.deepEqual(state.skippedChapterOrders, []);
  assert.deepEqual(state.remainingChapterOrders, [6]);
  assert.equal(state.nextChapterOrder, 6);
});

test("buildDirectorAutoExecutionScopeLabel supports chapter ranges and volume labels", () => {
  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "chapter_range",
    startOrder: 11,
    endOrder: 20,
  }), "第 11-20 章");

  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "volume",
    volumeOrder: 2,
  }, null, "中段反扑卷"), "第 2 卷 · 中段反扑卷");
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
