const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDirectorTakeoverPlan,
} = require("../dist/services/novel/director/novelDirectorTakeover.js");

function buildSnapshot(overrides = {}) {
  return {
    hasStoryMacroPlan: true,
    hasBookContract: true,
    characterCount: 5,
    chapterCount: 12,
    volumeCount: 2,
    firstVolumeId: "volume_1",
    firstVolumeChapterCount: 10,
    firstVolumeBeatSheetReady: true,
    firstVolumePreparedChapterCount: 10,
    generatedChapterCount: 3,
    approvedChapterCount: 2,
    pendingRepairChapterCount: 1,
    ...overrides,
  };
}

test("continue_existing from basic prefers repair continuation when pending fixes already exist", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "basic",
    strategy: "continue_existing",
    snapshot: buildSnapshot(),
    latestCheckpoint: {
      checkpointType: "front10_ready",
      stage: "chapter_execution",
      volumeId: "volume_1",
      chapterId: null,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 4,
      nextChapterId: "chapter_4",
      remainingChapterCount: 7,
    },
  });

  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "pipeline");
  assert.equal(plan.effectiveStage, "quality_repair");
  assert.equal(plan.usesCurrentBatch, true);
  assert.deepEqual(plan.skipSteps, ["basic", "story_macro", "character", "outline", "structured", "chapter"]);
});

test("continue_existing from story macro only fills missing character step", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "story_macro",
    strategy: "continue_existing",
    snapshot: buildSnapshot({ characterCount: 0 }),
    latestCheckpoint: null,
    executableRange: null,
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "character");
  assert.equal(plan.effectiveStage, "character_setup");
  assert.equal(plan.startPhase, "character_setup");
});

test("restart_current_step on pipeline clears repair outputs before rerun", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "pipeline",
    strategy: "restart_current_step",
    snapshot: buildSnapshot(),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "quality_repair",
      volumeId: "volume_1",
      chapterId: "chapter_3",
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      nextChapterOrder: 4,
      nextChapterId: "chapter_4",
      remainingChapterCount: 7,
    },
  });

  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "pipeline");
  assert.equal(plan.effectiveStage, "quality_repair");
  assert.equal(plan.usesCurrentBatch, false);
  assert.match(plan.effectSummary, /清空当前质量修复结果|重新审校/);
  assert.deepEqual(plan.impactNotes, ["保留当前章节正文。", "会重新进入自动审校与修复。"]);
});

test("continue_existing ignores old front10 repair state when the requested range starts at 11", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "chapter",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      pendingRepairChapterCount: 10,
    }),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "quality_repair",
      volumeId: "volume_1",
      chapterId: "chapter_4",
      chapterOrder: 4,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterId: "chapter_4",
      nextChapterOrder: 4,
    },
    requestedExecutionRange: {
      startOrder: 11,
      endOrder: 190,
      totalChapterCount: 180,
      nextChapterId: "chapter_11",
      nextChapterOrder: 11,
    },
    requestedPendingRepairChapterCount: 0,
  });

  assert.equal(plan.effectiveStep, "chapter");
  assert.equal(plan.effectiveStage, "chapter_execution");
  assert.equal(plan.usesCurrentBatch, false);
});

test("continue_existing stays in volume strategy when planned volume count is incomplete", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "outline",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      volumeCount: 7,
      expectedVolumeCount: 8,
      volumePlanningReady: false,
      structuredOutlineReady: false,
      chapterSyncReady: false,
      firstVolumeBeatSheetReady: true,
      firstVolumePreparedChapterCount: 10,
    }),
    latestCheckpoint: null,
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterOrder: 1,
      nextChapterId: "chapter_1",
    },
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "outline");
  assert.equal(plan.effectiveStage, "volume_strategy");
});

test("continue_existing stays in structured outline when any volume lacks details", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "structured",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      expectedVolumeCount: 8,
      volumePlanningReady: true,
      structuredOutlineReady: false,
      chapterSyncReady: false,
      firstVolumeBeatSheetReady: true,
      firstVolumePreparedChapterCount: 10,
    }),
    latestCheckpoint: null,
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterOrder: 1,
      nextChapterId: "chapter_1",
    },
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.effectiveStage, "structured_outline");
});

test("continue_existing does not enter chapter execution before chapter sync is ready", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "basic",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      expectedVolumeCount: 8,
      volumePlanningReady: true,
      structuredOutlineReady: true,
      chapterSyncReady: false,
      chapterCount: 50,
      plannedChapterCount: 383,
      firstVolumeBeatSheetReady: true,
      firstVolumePreparedChapterCount: 10,
    }),
    latestCheckpoint: null,
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterOrder: 11,
      nextChapterId: "chapter_11",
    },
  });

  assert.equal(plan.executionMode, "phase");
  assert.equal(plan.effectiveStep, "structured");
  assert.equal(plan.effectiveStage, "structured_outline");
});

test("continue_existing resumes chapter execution instead of repair when selected chapters are not fully written", () => {
  const plan = resolveDirectorTakeoverPlan({
    entryStep: "pipeline",
    strategy: "continue_existing",
    snapshot: buildSnapshot({
      volumePlanningReady: true,
      structuredOutlineReady: true,
      chapterSyncReady: true,
      chapterExecutionReadyForRepair: false,
      pendingRepairChapterCount: 0,
    }),
    latestCheckpoint: {
      checkpointType: "chapter_batch_ready",
      stage: "quality_repair",
      volumeId: "volume_1",
      chapterId: "chapter_4",
      chapterOrder: 4,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterId: "chapter_4",
      nextChapterOrder: 4,
    },
  });

  assert.equal(plan.executionMode, "auto_execution");
  assert.equal(plan.effectiveStep, "chapter");
  assert.equal(plan.effectiveStage, "chapter_execution");
});
