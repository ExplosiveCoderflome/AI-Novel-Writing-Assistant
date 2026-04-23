const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAssetFirstRecoveryFromSnapshot,
  resolveObservedResumePhaseFromWorkspace,
} = require("../dist/services/novel/director/novelDirectorRecovery.js");

test("asset-first recovery prefers structured outline when volume workspace already exists", () => {
  const phase = resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: true,
  });

  assert.equal(phase, "structured_outline");
});

test("asset-first recovery resumes auto execution from existing executable assets", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_sync",
    volumeCount: 2,
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

test("asset-first recovery resumes structured outline instead of regressing to volume strategy", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_ready",
    structuredOutlineRecoveryStep: "chapter_detail_bundle",
    volumeCount: 2,
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
