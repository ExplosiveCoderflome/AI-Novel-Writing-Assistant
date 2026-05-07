const assert = require("node:assert/strict");
const { test } = require("node:test");

const { DirectorTaskSnapshotService } = require("../dist/services/novel/director/DirectorTaskSnapshotService.js");

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
