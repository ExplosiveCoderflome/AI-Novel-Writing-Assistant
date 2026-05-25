import type {
  DirectorArtifactRef,
  DirectorChapterExecutionProgressSummary,
  DirectorTaskFactSummary,
} from "@ai-novel/shared/types/directorRuntime";
import {
  getWorkflowStepArtifacts,
  getWorkflowStepDirectorTaskId,
  getWorkflowStepProjectionHints,
  type WorkflowStepExecutionContext,
} from "./workflowStepRuntime/WorkflowStepModule";
import { getDirectorInputFromSeedPayload } from "./novelDirectorHelpers";
import { DirectorStateReader, type DirectorCanonicalState } from "./DirectorStateReader";
import { DirectorCoreStepModuleRuntime } from "./workflowStepRuntime/DirectorCoreStepModuleRuntime";

const DIRECTOR_STATE_HINT_KEY = "directorCanonicalState";
const DIRECTOR_FACT_BASE_SUMMARY_HINT_KEY = "directorFactBaseSummary";

export interface DirectorFactBaseSummary {
  hasNovelProject: boolean;
  candidate: {
    batchCount: number;
    candidateCount: number;
    mode: string | null;
    checkpointReady: boolean;
  };
  book: {
    hasStoryMacro: boolean;
    hasBookContract: boolean;
    characterCount: number;
  };
  outline: {
    hasVolumeStrategy: boolean;
    volumeCount: number;
    plannedChapterCount: number;
    beatSheetReady: boolean;
    chapterListReady: boolean;
    chapterDetailReady: boolean;
    selectedChapterCount: number;
    completedDetailSteps: number;
    totalDetailSteps: number;
    syncedChapterCount: number;
    cursorStep: string | null;
  };
  chapterExecution: DirectorChapterExecutionProgressSummary | null;
  repair: {
    draftedChapterCount: number;
    reviewedChapterCount: number;
    committedChapterCount: number;
    needsRepairChapterCount: number;
    hasReviewableDrafts: boolean;
  };
  artifactSync: {
    payoffArtifactCount: number;
    characterResourceArtifactCount: number;
  };
}

function isBaseSummary(value: unknown): value is DirectorFactBaseSummary {
  return Boolean(value && typeof value === "object" && "book" in (value as Record<string, unknown>));
}

function getContextStateHint(
  context: WorkflowStepExecutionContext,
): DirectorCanonicalState | null {
  const state = getWorkflowStepProjectionHints(context)?.[DIRECTOR_STATE_HINT_KEY];
  return state && typeof state === "object" ? state as DirectorCanonicalState : null;
}

function getContextBaseSummaryHint(
  context: WorkflowStepExecutionContext,
): DirectorFactBaseSummary | null {
  const summary = getWorkflowStepProjectionHints(context)?.[DIRECTOR_FACT_BASE_SUMMARY_HINT_KEY];
  return isBaseSummary(summary) ? summary : null;
}

function getArtifactsFromContext(context: WorkflowStepExecutionContext): DirectorArtifactRef[] {
  return getWorkflowStepArtifacts(context);
}

function countActiveArtifacts(
  artifacts: DirectorArtifactRef[],
  types: string[],
): number {
  const allowed = new Set(types);
  return artifacts.filter((artifact) => (
    artifact.status === "active" && allowed.has(artifact.artifactType)
  )).length;
}

function countReviewedChapters(progress: DirectorChapterExecutionProgressSummary | null): number {
  return progress?.chapters?.filter((chapter) => chapter.completedStages.includes("audit_completed")).length ?? 0;
}

function countCommittedChapters(progress: DirectorChapterExecutionProgressSummary | null): number {
  return progress?.chapters?.filter((chapter) => chapter.completedStages.includes("chapter_state_committed")).length ?? 0;
}

function countSyncedExecutionChapters(
  plannedOrders: number[],
  executionChapters: Array<{ order: number }>,
): number {
  const planned = new Set(
    plannedOrders
      .filter((order) => Number.isFinite(order))
      .map((order) => Math.round(order)),
  );
  return executionChapters.filter((chapter) => planned.has(Math.round(chapter.order))).length;
}

function buildEmptySummary(state: DirectorCanonicalState): DirectorFactBaseSummary {
  const batches = Array.isArray(state.seedPayload.batches) ? state.seedPayload.batches : [];
  const candidateCount = batches.reduce((sum, batch) => (
    sum + (Array.isArray(batch?.candidates) ? batch.candidates.length : 0)
  ), 0);
  return {
    hasNovelProject: Boolean(state.task.novelId?.trim()),
    candidate: {
      batchCount: batches.length,
      candidateCount,
      mode: typeof state.seedPayload.candidateStage?.mode === "string"
        ? state.seedPayload.candidateStage.mode
        : null,
      checkpointReady: batches.length > 0,
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
    chapterExecution: state.chapterProgress ?? null,
    repair: {
      draftedChapterCount: state.chapterProgress?.draftedChapterCount ?? 0,
      reviewedChapterCount: countReviewedChapters(state.chapterProgress ?? null),
      committedChapterCount: countCommittedChapters(state.chapterProgress ?? null),
      needsRepairChapterCount: state.chapterProgress?.needsRepairChapters ?? 0,
      hasReviewableDrafts: Boolean(state.chapterProgress?.draftedChapterCount),
    },
    artifactSync: {
      payoffArtifactCount: 0,
      characterResourceArtifactCount: 0,
    },
  };
}

export class DirectorFactSummaryService {
  private readonly stateReader: DirectorStateReader;
  private readonly runtime: DirectorCoreStepModuleRuntime;

  constructor(input: {
    stateReader?: DirectorStateReader;
    runtime?: DirectorCoreStepModuleRuntime;
  } = {}) {
    this.stateReader = input.stateReader ?? new DirectorStateReader();
    this.runtime = input.runtime ?? new DirectorCoreStepModuleRuntime();
  }

  private buildFallbackState(context: WorkflowStepExecutionContext): DirectorCanonicalState {
    return {
      task: {
        id: getWorkflowStepDirectorTaskId(context) ?? "__director_fact_fallback__",
        novelId: context.novelId?.trim() || null,
        lane: "auto_director",
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

  async getState(context: WorkflowStepExecutionContext): Promise<DirectorCanonicalState> {
    const hinted = getContextStateHint(context);
    if (hinted) {
      return hinted;
    }
    const taskId = getWorkflowStepDirectorTaskId(context);
    if (!taskId) {
      if (context.novelId?.trim()) {
        return this.buildFallbackState(context);
      }
      throw new Error("Director step module requires task context.");
    }
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      if (context.novelId?.trim()) {
        return this.buildFallbackState(context);
      }
      throw new Error("Director workflow task not found.");
    }
    return state;
  }

  async getBaseSummary(context: WorkflowStepExecutionContext): Promise<DirectorFactBaseSummary> {
    const hinted = getContextBaseSummaryHint(context);
    if (hinted) {
      return hinted;
    }
    const state = await this.getState(context);
    if (!state.task.novelId?.trim()) {
      return buildEmptySummary(state);
    }

    const novelId = state.task.novelId.trim();
    const request = getDirectorInputFromSeedPayload(state.seedPayload);
    const [storyMacroPlan, bookContract, characters, workspace, executionChapters] = await Promise.all([
      this.runtime.getStoryMacroPlan(novelId),
      this.runtime.getBookContract(novelId),
      this.runtime.getCharacters(novelId),
      this.runtime.getVolumeWorkspace(novelId),
      this.runtime.getExecutionChapters(novelId),
    ]);
    const cursor = workspace
      ? await this.runtime.getStructuredOutlineRecoveryCursor(novelId, request)
      : null;
    const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
      volume.chapters
        .map((chapter) => chapter.chapterOrder)
        .filter((order) => Number.isFinite(order))
    )) ?? [];
    const plannedChapterCount = plannedChapterOrders.length;
    const chapterProgress = await this.runtime.inspectChapterExecutionProgress(novelId);
    const artifacts = getArtifactsFromContext(context);

    return {
      hasNovelProject: true,
      candidate: buildEmptySummary(state).candidate,
      book: {
        hasStoryMacro: Boolean(storyMacroPlan?.decomposition && storyMacroPlan.storyInput?.trim()),
        hasBookContract: Boolean(bookContract),
        characterCount: characters.length,
      },
      outline: {
        hasVolumeStrategy: Boolean(workspace?.strategyPlan),
        volumeCount: workspace?.volumes.length ?? 0,
        plannedChapterCount,
        beatSheetReady: cursor ? cursor.step !== "beat_sheet" : false,
        chapterListReady: cursor
          ? cursor.step === "chapter_detail_bundle" || cursor.step === "chapter_sync" || cursor.step === "completed"
          : false,
        chapterDetailReady: cursor
          ? cursor.step === "chapter_sync" || cursor.step === "completed"
          : false,
        selectedChapterCount: cursor?.selectedChapters.length ?? 0,
        completedDetailSteps: cursor?.completedDetailSteps ?? 0,
        totalDetailSteps: cursor?.totalDetailSteps ?? 0,
        syncedChapterCount: countSyncedExecutionChapters(plannedChapterOrders, executionChapters),
        cursorStep: cursor?.step ?? null,
      },
      chapterExecution: chapterProgress ?? null,
      repair: {
        draftedChapterCount: chapterProgress?.draftedChapterCount ?? 0,
        reviewedChapterCount: countReviewedChapters(chapterProgress ?? null),
        committedChapterCount: countCommittedChapters(chapterProgress ?? null),
        needsRepairChapterCount: chapterProgress?.needsRepairChapters ?? 0,
        hasReviewableDrafts: (chapterProgress?.draftedChapterCount ?? 0) > 0 && countReviewedChapters(chapterProgress ?? null) > 0,
      },
      artifactSync: {
        payoffArtifactCount: countActiveArtifacts(artifacts, ["reader_promise", "repair_ticket"]),
        characterResourceArtifactCount: countActiveArtifacts(artifacts, ["character_governance_state", "continuity_state"]),
      },
    };
  }

  buildTaskSummary(input: {
    base: DirectorFactBaseSummary;
    steps: Array<{
      stepId: string;
      label: string;
      stage: string;
      completed: boolean;
      completenessRatio: number;
      evidence?: Record<string, unknown>;
      nextAction?: string | null;
    }>;
    currentFactStepId?: string | null;
    currentFactStepLabel?: string | null;
    currentFactEvidence?: Record<string, unknown> | null;
  }): DirectorTaskFactSummary {
    const completedStepCount = input.steps.filter((step) => step.completed).length;
    const totalStepCount = input.steps.length;
    const chapterExecution = input.base.chapterExecution;
    const expectedChapterCount = input.base.outline.plannedChapterCount > 0
      ? input.base.outline.plannedChapterCount
      : (chapterExecution?.totalChapters ?? null);

    return {
      allStepsCompleted: totalStepCount > 0 && completedStepCount >= totalStepCount,
      completedStepCount,
      totalStepCount,
      currentFactStepId: input.currentFactStepId ?? null,
      currentFactStepLabel: input.currentFactStepLabel ?? null,
      currentFactEvidence: input.currentFactEvidence ?? null,
      hasNovelProject: input.base.hasNovelProject,
      hasStoryMacro: input.base.book.hasStoryMacro,
      hasBookContract: input.base.book.hasBookContract,
      characterCount: input.base.book.characterCount,
      hasVolumeStrategy: input.base.outline.hasVolumeStrategy,
      volumeCount: input.base.outline.volumeCount,
      outlineFacts: {
        beatSheetReady: input.base.outline.beatSheetReady,
        chapterListReady: input.base.outline.chapterListReady,
        chapterDetailReady: input.base.outline.chapterDetailReady,
        plannedChapterCount: input.base.outline.plannedChapterCount,
        selectedChapterCount: input.base.outline.selectedChapterCount,
        completedDetailSteps: input.base.outline.completedDetailSteps,
        totalDetailSteps: input.base.outline.totalDetailSteps,
        syncedChapterCount: input.base.outline.syncedChapterCount,
      },
      chapterExecutionFacts: {
        totalChapters: chapterExecution?.totalChapters ?? 0,
        draftedChapterCount: chapterExecution?.draftedChapterCount ?? 0,
        reviewedChapterCount: input.base.repair.reviewedChapterCount,
        approvedChapterCount: chapterExecution?.approvedChapterCount ?? 0,
        committedChapterCount: input.base.repair.committedChapterCount,
        completedChapters: chapterExecution?.completedChapters ?? 0,
        needsRepairChapters: chapterExecution?.needsRepairChapters ?? 0,
        ratio: chapterExecution?.ratio ?? 0,
        expectedChapterCount,
      },
      repairFacts: {
        draftedChapterCount: input.base.repair.draftedChapterCount,
        reviewedChapterCount: input.base.repair.reviewedChapterCount,
        committedChapterCount: input.base.repair.committedChapterCount,
        needsRepairChapters: input.base.repair.needsRepairChapterCount,
        payoffArtifactCount: input.base.artifactSync.payoffArtifactCount,
        characterResourceArtifactCount: input.base.artifactSync.characterResourceArtifactCount,
      },
      steps: input.steps.map((step) => ({
        stepId: step.stepId,
        label: step.label,
        stage: step.stage,
        completed: step.completed,
        completenessRatio: step.completenessRatio,
        evidence: step.evidence,
        nextAction: step.nextAction ?? null,
      })),
    };
  }
}
