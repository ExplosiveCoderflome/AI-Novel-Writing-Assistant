const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorDisplayState,
} = require("../dist/services/novel/director/projections/DirectorDisplayStateBuilder.js");

test("display state maps chapter draft execution into chapter stage and uses fact progress", () => {
  const displayState = buildDirectorDisplayState({
    task: {
      status: "running",
      currentStage: "chapter_execution",
      currentItemKey: "chapter.draft.write",
      currentItemLabel: "执行章节生成批次",
      progress: 0.1,
      checkpointType: "chapter_batch_ready",
      checkpointSummary: null,
      lastError: null,
      pendingManualRecovery: false,
    },
    projection: {
      status: "running",
      currentLabel: "正在推进第 10 章",
      requiresUserAction: false,
      progressBreakdown: {
        totalPercent: 45,
        activeJobProgress: 1,
      },
    },
    activeStepNodeKey: "chapter_execution_node",
    currentFactStepId: "chapter.draft.write",
    currentFactStepLabel: "执行章节生成批次",
    factStep: {
      module: {
        id: "chapter.draft.write",
        label: "执行章节生成批次",
      },
      facts: {
        nextAction: "continue_chapter_execution",
      },
      progress: {
        status: "partially_done",
        ratio: 0.45,
        label: "正在推进第 10 章",
        nextAction: "continue_chapter_execution",
        evidence: {
          draftedChapterCount: 24,
          totalChapters: 53,
        },
      },
    },
    chapterProgress: {
      totalChapters: 53,
      draftedChapterCount: 24,
      approvedChapterCount: 9,
      completedChapters: 9,
      needsRepairChapters: 15,
      ratio: 0.45,
    },
  });

  assert.equal(displayState.stageKey, "chapter_execution");
  assert.equal(displayState.stageLabel, "章节执行");
  assert.equal(displayState.stepIndex, 5);
  assert.equal(displayState.progressPercent, 45);
  assert.equal(displayState.currentAction, "正在推进第 10 章");
  assert.equal(displayState.nextActionLabel, "继续章节执行");
  assert.equal(displayState.steps[5].status, "running");
});

test("display state keeps running mode when recovery flag exists but live runtime progress is visible", () => {
  const displayState = buildDirectorDisplayState({
    task: {
      status: "running",
      currentStage: "structured_outline",
      currentItemKey: "chapter_detail_bundle",
      currentItemLabel: "执行章节任务包细化",
      progress: 0.94,
      checkpointType: "chapter_batch_ready",
      checkpointSummary: null,
      lastError: "stale recovery hint",
      pendingManualRecovery: true,
    },
    projection: {
      status: "running",
      currentLabel: "执行章节任务包细化",
      requiresUserAction: false,
      progressBreakdown: {
        totalPercent: 94,
        activeJobProgress: 1,
      },
    },
    activeStepNodeKey: "chapter_detail_bundle",
    currentFactStepId: "volume.chapter_detail_bundle.generate",
    currentFactStepLabel: "执行章节任务包细化",
    factStep: {
      module: {
        id: "volume.chapter_detail_bundle.generate",
        label: "执行章节任务包细化",
      },
      facts: {
        nextAction: "continue",
      },
      progress: {
        status: "partially_done",
        ratio: 0.94,
        label: "执行章节任务包细化",
        nextAction: "continue",
        evidence: {},
      },
    },
    chapterProgress: null,
  });

  assert.equal(displayState.stageKey, "structured_outline");
  assert.equal(displayState.mode, "running");
  assert.equal(displayState.needsRecovery, false);
  assert.equal(displayState.isLiveRunning, true);
});

test("display state does not mark succeeded task as completed before facts close", () => {
  const displayState = buildDirectorDisplayState({
    task: {
      status: "succeeded",
      currentStage: "story_macro",
      currentItemKey: "story.macro.plan",
      currentItemLabel: "鏁呬簨瀹忚瑙勫垝",
      progress: 1,
      checkpointType: "workflow_completed",
      checkpointSummary: "workflow completed",
      lastError: null,
      pendingManualRecovery: false,
    },
    projection: {
      status: "idle",
      requiresUserAction: false,
      progressBreakdown: {
        totalPercent: 70,
        activeJobProgress: 0,
      },
    },
    factSummary: {
      allStepsCompleted: false,
      completedStepCount: 7,
      totalStepCount: 10,
      hasNovelProject: true,
      hasStoryMacro: true,
      hasBookContract: true,
      characterCount: 3,
      hasVolumeStrategy: true,
      volumeCount: 1,
      outlineFacts: {
        beatSheetReady: true,
        chapterListReady: true,
        chapterDetailReady: false,
        plannedChapterCount: 20,
        selectedChapterCount: 10,
        completedDetailSteps: 5,
        totalDetailSteps: 10,
        syncedChapterCount: 8,
      },
      chapterExecutionFacts: {
        totalChapters: 20,
        draftedChapterCount: 8,
        reviewedChapterCount: 4,
        approvedChapterCount: 2,
        committedChapterCount: 2,
        completedChapters: 2,
        needsRepairChapters: 2,
        ratio: 0.4,
        expectedChapterCount: 20,
      },
      repairFacts: {
        draftedChapterCount: 8,
        reviewedChapterCount: 4,
        committedChapterCount: 2,
        needsRepairChapters: 2,
        payoffArtifactCount: 1,
        characterResourceArtifactCount: 1,
      },
      steps: [],
    },
    activeStepNodeKey: null,
    currentFactStepId: "volume.chapter_detail_bundle.generate",
    currentFactStepLabel: "绔犺妭浠诲姟鍗曠粏鍖?",
    factStep: null,
    chapterProgress: null,
  });

  assert.notEqual(displayState.mode, "completed");
});

function buildMinimalDisplayState(patch) {
  return buildDirectorDisplayState({
    task: {
      status: "running",
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      progress: 0,
      checkpointType: null,
      checkpointSummary: null,
      lastError: null,
      pendingManualRecovery: false,
      ...patch.task,
    },
    projection: {
      status: "idle",
      requiresUserAction: false,
      ...patch.projection,
    },
    activeStepNodeKey: patch.activeStepNodeKey ?? null,
    currentFactStepId: patch.currentFactStepId ?? null,
    currentFactStepLabel: patch.currentFactStepLabel ?? null,
    factStep: null,
    chapterProgress: null,
  });
}

test("display state resolves stage from catalog fact step, node alias, checkpoint and task stage", () => {
  assert.equal(
    buildMinimalDisplayState({
      currentFactStepId: "character.cast.prepare",
    }).stageKey,
    "character_setup",
  );

  assert.equal(
    buildMinimalDisplayState({
      activeStepNodeKey: "chapter_sync",
    }).stageKey,
    "structured_outline",
  );

  assert.equal(
    buildMinimalDisplayState({
      task: {
        status: "waiting_approval",
        checkpointType: "book_contract_ready",
      },
    }).stageKey,
    "story_planning",
  );

  assert.equal(
    buildMinimalDisplayState({
      task: {
        currentStage: "story_macro",
      },
    }).stageKey,
    "story_planning",
  );
});
