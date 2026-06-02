import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorArtifactRef,
  DirectorChapterExecutionProgressItem,
  DirectorChapterExecutionProgressSummary,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorCandidateStageNode } from "../novelDirectorCandidateNodeAdapters";
import { getDirectorInputFromSeedPayload } from "../novelDirectorHelpers";
import {
  resolveDirectorAutoExecutionPlanChapterRange,
  resolveDirectorAutoExecutionRangeFromState,
} from "../automation/novelDirectorAutoExecution";
import { DirectorStateReader } from "../DirectorStateReader";
import { DirectorStateCommitter } from "../DirectorStateCommitter";
import { DirectorFactSummaryService } from "../DirectorFactSummaryService";
import { CHAPTER_EXECUTION_PROGRESS_STAGES } from "../runtime/ChapterExecutionProgressInspector";
import { DirectorCoreStepModuleRuntime } from "./DirectorCoreStepModuleRuntime";
import type {
  WorkflowStepExecutionContext,
  WorkflowStepProgress,
} from "./WorkflowStepModule";

let directorCoreStepRuntime: DirectorCoreStepModuleRuntime | null = null;
let directorCoreStateReader: DirectorStateReader | null = null;
let directorCoreStateCommitter: DirectorStateCommitter | null = null;
let directorFactSummaryService: DirectorFactSummaryService | null = null;

export function getDirectorCoreStepRuntime(): DirectorCoreStepModuleRuntime {
  if (!directorCoreStepRuntime) {
    directorCoreStepRuntime = new DirectorCoreStepModuleRuntime();
  }
  return directorCoreStepRuntime;
}

export function getDirectorCoreStateReader(): DirectorStateReader {
  if (!directorCoreStateReader) {
    directorCoreStateReader = new DirectorStateReader();
  }
  return directorCoreStateReader;
}

export function getDirectorCoreStateCommitter(): DirectorStateCommitter {
  if (!directorCoreStateCommitter) {
    directorCoreStateCommitter = new DirectorStateCommitter();
  }
  return directorCoreStateCommitter;
}

export function getDirectorFactSummary(): DirectorFactSummaryService {
  if (!directorFactSummaryService) {
    directorFactSummaryService = new DirectorFactSummaryService({
      stateReader: getDirectorCoreStateReader(),
      runtime: getDirectorCoreStepRuntime(),
    });
  }
  return directorFactSummaryService;
}

export async function loadDirectorModuleState(
  context: WorkflowStepExecutionContext,
  options: {
    requireNovel?: boolean;
    requireRequest?: boolean;
  } = {},
) {
  const state = await getDirectorFactSummary().getState(context);
  const novelId = context.novelId?.trim() || state.task.novelId?.trim() || "";
  if (options.requireNovel !== false && !novelId) {
    throw new Error("Director step module requires a bound novel.");
  }
  const request = getDirectorInputFromSeedPayload(state.seedPayload);
  if ((options.requireRequest ?? false) && !request) {
    throw new Error("Director step module requires persisted director input.");
  }
  return {
    state,
    novelId,
    request: request ?? null,
  };
}

export function buildSimpleProgress(input: {
  status: WorkflowStepProgress["status"];
  ratio: number;
  label: string;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
}): WorkflowStepProgress {
  const ratio = Math.max(0, Math.min(1, input.ratio));
  return {
    status: input.status,
    current: ratio,
    total: 1,
    ratio,
    label: input.label,
    evidence: input.evidence,
    nextAction: input.nextAction ?? null,
  };
}

export function countMaterializedExecutionChapters(input: {
  plannedChapterOrders: number[];
  executionChapters: Array<{ order: number }>;
}): number {
  const executionChapterOrders = new Set(
    input.executionChapters
      .map((chapter) => chapter.order)
      .filter((order) => Number.isFinite(order)),
  );
  return input.plannedChapterOrders.filter((order) => executionChapterOrders.has(order)).length;
}

export function resolveChapterExecutionProgressScope(input: {
  state: Awaited<ReturnType<DirectorFactSummaryService["getState"]>>;
  request?: DirectorConfirmRequest | null;
}): { startOrder: number; endOrder: number } | null {
  const stateRange = resolveDirectorAutoExecutionRangeFromState(input.state.seedPayload.autoExecution);
  if (stateRange) {
    return {
      startOrder: stateRange.startOrder,
      endOrder: stateRange.endOrder,
    };
  }
  return resolveDirectorAutoExecutionPlanChapterRange(
    input.request?.autoExecutionPlan ?? input.state.seedPayload.autoExecutionPlan ?? null,
  );
}

export function resolveCurrentScopedChapter(
  chapters: DirectorChapterExecutionProgressItem[],
): DirectorChapterExecutionProgressItem | null {
  const active = chapters.find((chapter) => chapter.status === "running") ?? null;
  return active
    ?? chapters.find((chapter) => chapter.status === "needs_repair")
    ?? chapters.find((chapter) => chapter.status === "not_started")
    ?? null;
}

export function scopeChapterExecutionProgress(
  progress: DirectorChapterExecutionProgressSummary | null,
  range: { startOrder: number; endOrder: number } | null,
): DirectorChapterExecutionProgressSummary | null {
  if (!progress || !range) {
    return progress;
  }
  const chapters = (progress.chapters ?? []).filter((chapter) => (
    chapter.chapterOrder >= range.startOrder && chapter.chapterOrder <= range.endOrder
  ));
  const current = resolveCurrentScopedChapter(chapters);
  const recoverableChapters = chapters.filter((chapter) => chapter.recoverable);
  const totalStageCount = Math.max(1, chapters.length * CHAPTER_EXECUTION_PROGRESS_STAGES.length);
  const completedStageCount = chapters.reduce((sum, chapter) => sum + chapter.completedStages.length, 0);
  return {
    ...progress,
    totalChapters: chapters.length,
    draftedChapterCount: chapters.filter((chapter) => chapter.completedStages.includes("draft_saved")).length,
    approvedChapterCount: chapters.filter((chapter) => chapter.status === "approved").length,
    completedChapters: chapters.filter((chapter) => (
      chapter.status === "approved" || chapter.status === "completed"
    )).length,
    needsRepairChapters: chapters.filter((chapter) => chapter.status === "needs_repair").length,
    activeChapterId: current?.status === "running" ? current.chapterId : null,
    activeChapterOrder: current?.status === "running" ? current.chapterOrder : null,
    currentChapterId: current?.chapterId ?? null,
    currentChapterOrder: current?.chapterOrder ?? null,
    currentStage: current?.currentStage ?? null,
    recoverableRange: {
      startOrder: recoverableChapters[0]?.chapterOrder ?? null,
      endOrder: recoverableChapters[recoverableChapters.length - 1]?.chapterOrder ?? null,
    },
    ratio: chapters.length === 0 ? 0 : completedStageCount / totalStageCount,
    chapters,
  };
}

export function getCandidateStageMode(stage: DirectorCandidateStageNode): string | null {
  switch (stage) {
    case "candidate_generation":
      return null;
    case "candidate_refine":
      return "refine";
    case "candidate_patch":
      return "patch_candidate";
    case "candidate_title_refine":
      return "refine_titles";
    default:
      return null;
  }
}

export function isCandidateStageFactCompleted(input: {
  stage: DirectorCandidateStageNode;
  batchCount: number;
  mode: string | null;
  hasNovelProject: boolean;
}): boolean {
  if (input.batchCount <= 0) {
    return false;
  }
  if (input.stage === "candidate_generation") {
    return true;
  }
  if (input.hasNovelProject) {
    return true;
  }
  return input.mode === getCandidateStageMode(input.stage);
}

export function completedFact(stepId: string, input?: {
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}): {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
} {
  return {
    stepId,
    completed: true,
    completenessRatio: 1,
    evidence: input?.evidence,
    producedArtifacts: input?.producedArtifacts,
  };
}

export function pendingFact(stepId: string, input?: {
  ratio?: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}): {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
} {
  return {
    stepId,
    completed: false,
    completenessRatio: Math.max(0, Math.min(1, input?.ratio ?? 0)),
    evidence: input?.evidence,
    producedArtifacts: input?.producedArtifacts,
  };
}

export function readyState(input?: {
  evidence?: Record<string, unknown>;
  resumeFrom?: string | null;
}) {
  return {
    ready: true,
    blockers: [],
    evidence: input?.evidence,
    resumeFrom: input?.resumeFrom ?? null,
  };
}

export function blockedState(reason: string, input?: {
  code?: string;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
  retryable?: boolean;
  resumeFrom?: string | null;
}) {
  return {
    ready: false,
    blockers: [{
      code: input?.code ?? "blocked",
      reason,
      retryable: input?.retryable ?? true,
      nextAction: input?.nextAction ?? null,
      evidence: input?.evidence,
    }],
    evidence: input?.evidence,
    resumeFrom: input?.resumeFrom ?? null,
  };
}

export async function loadFactBaseSummary(context: WorkflowStepExecutionContext) {
  return getDirectorFactSummary().getBaseSummary(context);
}

export function requireDirectorRequest(request: DirectorConfirmRequest | null): DirectorConfirmRequest {
  if (!request) {
    throw new Error("Director step module requires persisted director input.");
  }
  return request;
}

export function getActiveArtifactsFromContext(
  context: WorkflowStepExecutionContext,
  types: string[],
): DirectorArtifactRef[] {
  const allowed = new Set(types);
  return (context.artifacts ?? []).filter((artifact): artifact is DirectorArtifactRef => (
    Boolean(artifact)
    && artifact.status === "active"
    && allowed.has(artifact.artifactType)
  ));
}
