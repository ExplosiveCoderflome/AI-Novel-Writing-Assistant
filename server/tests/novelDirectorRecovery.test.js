const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAssetFirstRecoveryFromSnapshot,
  resolveObservedResumePhaseFromWorkspace,
  resolveSafeDirectorPipelineStartPhase,
} = require("../dist/services/novel/director/recovery/novelDirectorRecovery.js");

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
    hasStoryMacroPlan: true,
    hasBookContract: true,
    hasWorldSetupPrepared: true,
    hasCharacters: true,
    hasVolumeWorkspace: true,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "volume_strategy");
});

test("safe pipeline phase does not let stale volume strategy skip missing book assets", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "structured_outline",
    hasStoryMacroPlan: false,
    hasBookContract: false,
    hasCharacters: true,
    hasVolumeWorkspace: true,
    hasVolumeStrategyPlan: true,
  });

  assert.equal(phase, "story_macro");
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
    hasWorldSetupPrepared: true,
    hasCharacters: true,
    hasVolumeWorkspace: false,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "volume_strategy");
});

test("safe pipeline phase prepares book world before character setup", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "character_setup",
    hasStoryMacroPlan: true,
    hasBookContract: true,
    hasWorldSetupPrepared: false,
    hasCharacters: false,
    hasVolumeWorkspace: false,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "world_setup");
});

test("safe pipeline phase treats skipped world setup as prepared", () => {
  const phase = resolveSafeDirectorPipelineStartPhase({
    requestedPhase: "character_setup",
    hasStoryMacroPlan: true,
    hasBookContract: true,
    hasWorldSetupPrepared: true,
    hasCharacters: false,
    hasVolumeWorkspace: false,
    hasVolumeStrategyPlan: false,
  });

  assert.equal(phase, "character_setup");
});

test("safe pipeline phase preserves current fallback table across all known phases", () => {
  const requestedPhases = [
    "story_macro",
    "book_contract",
    "world_setup",
    "character_setup",
    "volume_strategy",
    "structured_outline",
  ];
  const assetStates = [
    {
      label: "none",
      input: {
        hasStoryMacroPlan: false,
        hasBookContract: false,
        hasWorldSetupPrepared: false,
        hasCharacters: false,
        hasVolumeWorkspace: false,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "story_macro",
        book_contract: "story_macro",
        world_setup: "story_macro",
        character_setup: "world_setup",
        volume_strategy: "world_setup",
        structured_outline: "story_macro",
      },
    },
    {
      label: "story only",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: false,
        hasWorldSetupPrepared: false,
        hasCharacters: false,
        hasVolumeWorkspace: false,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "book_contract",
        book_contract: "book_contract",
        world_setup: "book_contract",
        character_setup: "world_setup",
        volume_strategy: "world_setup",
        structured_outline: "book_contract",
      },
    },
    {
      label: "book contract ready",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        hasWorldSetupPrepared: false,
        hasCharacters: false,
        hasVolumeWorkspace: false,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "world_setup",
        book_contract: "world_setup",
        world_setup: "world_setup",
        character_setup: "world_setup",
        volume_strategy: "world_setup",
        structured_outline: "world_setup",
      },
    },
    {
      label: "world ready",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        hasWorldSetupPrepared: true,
        hasCharacters: false,
        hasVolumeWorkspace: false,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "character_setup",
        book_contract: "character_setup",
        world_setup: "world_setup",
        character_setup: "character_setup",
        volume_strategy: "volume_strategy",
        structured_outline: "character_setup",
      },
    },
    {
      label: "characters ready",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        hasWorldSetupPrepared: true,
        hasCharacters: true,
        hasVolumeWorkspace: false,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "volume_strategy",
        book_contract: "volume_strategy",
        world_setup: "volume_strategy",
        character_setup: "volume_strategy",
        volume_strategy: "volume_strategy",
        structured_outline: "volume_strategy",
      },
    },
    {
      label: "volume workspace without strategy plan",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        hasWorldSetupPrepared: true,
        hasCharacters: true,
        hasVolumeWorkspace: true,
        hasVolumeStrategyPlan: false,
      },
      expected: {
        story_macro: "volume_strategy",
        book_contract: "volume_strategy",
        world_setup: "volume_strategy",
        character_setup: "volume_strategy",
        volume_strategy: "volume_strategy",
        structured_outline: "volume_strategy",
      },
    },
    {
      label: "structured outline observed",
      input: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        hasWorldSetupPrepared: true,
        hasCharacters: true,
        hasVolumeWorkspace: true,
        hasVolumeStrategyPlan: true,
      },
      expected: {
        story_macro: "structured_outline",
        book_contract: "structured_outline",
        world_setup: "structured_outline",
        character_setup: "structured_outline",
        volume_strategy: "structured_outline",
        structured_outline: "structured_outline",
      },
    },
  ];

  for (const state of assetStates) {
    for (const requestedPhase of requestedPhases) {
      assert.equal(
        resolveSafeDirectorPipelineStartPhase({
          requestedPhase,
          ...state.input,
        }),
        state.expected[requestedPhase],
        `${state.label} / ${requestedPhase}`,
      );
    }
  }
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

test("asset-first recovery treats full-book autopilot as auto execution", () => {
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "full_book_autopilot",
    structuredOutlineRecoveryStep: "completed",
    volumeCount: 4,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: false,
    hasExecutableRange: true,
    hasAutoExecutionState: true,
    latestCheckpointType: "replan_required",
  });

  assert.deepEqual(recovery, {
    type: "auto_execution",
    resumeCheckpointType: "replan_required",
  });
});

test("asset-first recovery routes to structured outline when persisted range still lacks execution contracts", () => {
  // 卷工作区 cursor 误报已完成（chapter_sync），但执行区持久化章节仍缺细化。
  // 此时必须回到节奏 / 拆章补齐，而不是进入 auto_execution 抛错卡死。
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_sync",
    volumeCount: 2,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: false,
    hasExecutableRange: true,
    hasAutoExecutionState: true,
    hasMissingExecutionContractInRange: true,
    latestCheckpointType: "chapter_batch_ready",
  });

  assert.deepEqual(recovery, {
    type: "phase",
    phase: "structured_outline",
  });
});

test("asset-first recovery does not interrupt an active batch to补齐细化", () => {
  // 有进行中的批次时，缺口信号不应打断当前批次。
  const recovery = resolveAssetFirstRecoveryFromSnapshot({
    runMode: "auto_to_execution",
    structuredOutlineRecoveryStep: "chapter_sync",
    volumeCount: 2,
    hasVolumeStrategyPlan: true,
    hasActivePipelineJob: true,
    hasExecutableRange: true,
    hasAutoExecutionState: true,
    hasMissingExecutionContractInRange: true,
    latestCheckpointType: "chapter_batch_ready",
  });

  assert.equal(recovery.type, "auto_execution");
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
