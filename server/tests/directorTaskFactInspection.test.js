const assert = require("node:assert/strict");
const { test } = require("node:test");

const { DirectorTaskSnapshotService } = require("../dist/services/novel/director/projections/DirectorTaskSnapshotService.js");
const { DirectorFactSummaryService } = require("../dist/services/novel/director/projections/DirectorFactSummaryService.js");

function buildState(input) {
  return {
    task: {
      id: input.id,
      novelId: input.novelId,
      lane: input.lane,
      status: "running",
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      progress: null,
      checkpointType: null,
      checkpointSummary: null,
      lastError: null,
      pendingManualRecovery: false,
      cancelRequestedAt: null,
    },
    run: null,
    runtime: null,
    latestCommand: null,
    activeStep: null,
    seedPayload: {},
    chapterProgress: null,
  };
}

function buildBaseSummary() {
  return {
    hasNovelProject: true,
    candidate: {
      batchCount: 0,
      candidateCount: 0,
      mode: null,
      checkpointReady: false,
    },
    book: {
      hasStoryMacro: false,
      hasBookContract: false,
      characterCount: 0,
    },
    outline: {
      hasVolumeStrategy: false,
      volumeCount: 0,
      plannedChapterCount: 0,
      beatSheetReady: false,
      chapterListReady: false,
      chapterDetailReady: false,
      selectedChapterCount: 0,
      completedDetailSteps: 0,
      totalDetailSteps: 0,
      syncedChapterCount: 0,
      cursorStep: null,
    },
    chapterExecution: null,
    repair: {
      draftedChapterCount: 0,
      reviewedChapterCount: 0,
      committedChapterCount: 0,
      needsRepairChapterCount: 0,
      hasReviewableDrafts: false,
    },
    artifactSync: {
      payoffArtifactCount: 0,
      characterResourceArtifactCount: 0,
    },
  };
}

test("task fact inspection resolves stale manual task to latest auto director task", async () => {
  const runtimeTaskIds = [];
  const service = new DirectorTaskSnapshotService({
    stateReader: {
      readByTaskId: async (taskId) => buildState({
        id: taskId,
        novelId: "novel-1",
        lane: "manual_create",
      }),
      readLatestByNovelId: async (novelId) => buildState({
        id: `auto-for-${novelId}`,
        novelId,
        lane: "auto_director",
      }),
    },
    runtimeStore: {
      getSnapshot: async (taskId) => {
        runtimeTaskIds.push(taskId);
        return {
          events: [],
          artifacts: [],
        };
      },
    },
    projectionService: {
      buildSnapshotProjection: () => null,
    },
    factSummaryService: {
      getBaseSummary: async () => buildBaseSummary(),
      buildTaskSummary: (input) => ({
        currentFactStepId: input.currentFactStepId,
        currentFactStepLabel: input.currentFactStepLabel,
        currentFactEvidence: input.currentFactEvidence,
      }),
    },
  });

  const response = await service.getTaskFactInspection("manual-task");

  assert.equal(response.inspection.taskId, "auto-for-novel-1");
  assert.equal(response.inspection.novelId, "novel-1");
  assert.deepEqual(runtimeTaskIds, ["auto-for-novel-1"]);
});

test("director fact summary uses fresh chapter progress instead of stale task snapshot", async () => {
  const staleProgress = {
    totalChapters: 2,
    draftedChapterCount: 0,
    approvedChapterCount: 0,
    completedChapters: 0,
    needsRepairChapters: 0,
    activeChapterId: null,
    activeChapterOrder: null,
    currentChapterId: "chapter-1",
    currentChapterOrder: 1,
    currentStage: "draft_started",
    recoverableRange: { startOrder: null, endOrder: null },
    ratio: 0,
    chapters: [],
  };
  const freshProgress = {
    ...staleProgress,
    draftedChapterCount: 2,
    approvedChapterCount: 1,
    completedChapters: 1,
    needsRepairChapters: 0,
    ratio: 0.7,
    chapters: [
      {
        chapterId: "chapter-1",
        chapterOrder: 1,
        status: "approved",
        currentStage: "reviewable_or_approved",
        completedStages: ["draft_saved", "audit_completed", "chapter_state_committed"],
        missingStages: [],
        evidence: {},
        recoverable: false,
        nextAction: "continue_next_chapter",
      },
      {
        chapterId: "chapter-2",
        chapterOrder: 2,
        status: "reviewable",
        currentStage: "chapter_state_committed",
        completedStages: ["draft_saved", "audit_completed"],
        missingStages: ["chapter_state_committed"],
        evidence: {},
        recoverable: false,
        nextAction: "commit_state",
      },
    ],
  };
  const service = new DirectorFactSummaryService({
    stateReader: {
      readByTaskId: async (taskId) => ({
        ...buildState({
          id: taskId,
          novelId: "novel-1",
          lane: "auto_director",
        }),
        chapterProgress: staleProgress,
      }),
    },
    runtime: {
      getStoryMacroPlan: async () => null,
      getBookContract: async () => null,
      getCharacters: async () => [],
      getVolumeWorkspace: async () => null,
      getExecutionChapters: async () => [],
      getStructuredOutlineRecoveryCursor: async () => null,
      inspectChapterExecutionProgress: async () => freshProgress,
    },
  });

  const summary = await service.getBaseSummary({
    taskId: "task-fresh-progress",
    novelId: "novel-1",
    artifacts: [],
  });

  assert.equal(summary.chapterExecution.draftedChapterCount, 2);
  assert.equal(summary.chapterExecution.approvedChapterCount, 1);
  assert.equal(summary.repair.draftedChapterCount, 2);
  assert.equal(summary.repair.reviewedChapterCount, 2);
  assert.equal(summary.repair.committedChapterCount, 1);
});
