const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAssetFirstRecoveryFromSnapshot,
  resolveObservedResumePhaseFromWorkspace,
  resolveSafeDirectorPipelineStartPhase,
} = require("../dist/services/novel/director/novelDirectorRecovery.js");

test("observed resume phase only advances to structured outline when strategy plan exists", () => {
  const phase = resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: true,
    hasVolumeStrategyPlan: true,
  });

  assert.equal(phase, "structured_outline");
});

test("observed resume phase does not treat placeholder legacy volumes as structured outline progress", () => {
  const phase = resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: true,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, null);
});

test("safe pipeline phase falls back to volume strategy when structured outline assets are incomplete", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "structured_outline",
    hasVolumeWorkspace: true,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "volume_strategy");
});

test("safe pipeline phase resumes book contract when story macro exists without contract", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "story_macro",
    hasStoryMacroPlan: true,
    hasBookContract: false,
    hasCharacters: false,
    hasVolumeWorkspace: false,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "book_contract");
});

test("safe pipeline phase skips character setup when characters already exist", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "story_macro",
    hasStoryMacroPlan: true,
    hasBookContract: true,
    hasCharacters: true,
    hasVolumeWorkspace: false,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "volume_strategy");
});

test("asset-first recovery resumes auto execution from existing executable assets", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_sync",
    volumeCount: 2,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: false,
    hasExecutableRange: true,
    hasAutoExecutionState: true,
    latestCheckpointType: "chapter_batch_ready",
  });

  assert.deepEqual(recovery, {
    type: "auto_execution",
    resumeCheckpointType: "chapter_batch_ready",
  });
});

test("asset-first recovery keeps structured outline first when requested scope is not fully detailed", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_detail_bundle",
    volumeCount: 10,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: true,
    hasExecutableRange: true,
    hasAutoExecutionState: true,
    latestCheckpointType: "chapter_batch_ready",
  });

  assert.deepEqual(recovery, {
    type: "phase",
    phase: "structured_outline",
  });
});

test("asset-first recovery keeps structured outline at chapter sync when execution range is stale", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_sync",
    volumeCount: 10,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: true,
    hasExecutableRange: false,
    hasAutoExecutionState: true,
    latestCheckpointType: "chapter_batch_ready",
  });

  assert.deepEqual(recovery, {
    type: "phase",
    phase: "structured_outline",
  });
});

test("asset-first recovery resumes structured outline instead of regressing to volume strategy", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_ready",
    structuredOutlineRecoveryStep: "chapter_detail_bundle",
    volumeCount: 2,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: false,
    hasExecutableRange: false,
    hasAutoExecutionState: false,
    latestCheckpointType: null,
  });

  assert.deepEqual(recovery, {
    type: "phase",
    phase: "structured_outline",
  });
});

test("asset-first recovery does not jump into structured outline with placeholder volumes only", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_ready",
    structuredOutlineRecoveryStep: "beat_sheet",
    volumeCount: 1,
    hasVolumeStrategyPlan: false,
    hasActivePipelineJob: false,
    hasExecutableRange: false,
    hasAutoExecutionState: false,
    latestCheckpointType: null,
  });

  assert.equal(recovery, null);
});
