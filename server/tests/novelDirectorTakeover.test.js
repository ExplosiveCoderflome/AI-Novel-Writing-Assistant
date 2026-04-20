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
