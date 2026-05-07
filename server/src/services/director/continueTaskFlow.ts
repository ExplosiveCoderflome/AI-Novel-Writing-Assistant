import {
  DIRECTOR_RUN_MODES,
  type DirectorConfirmRequest,
  type DirectorContinuationMode,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import { buildNovelEditResumeTarget, parseSeedPayload, parseResumeTarget } from "../novel/workflow/novelWorkflow.shared";
import { normalizeDirectorMemoryScope } from "./autoMemorySafety";
import type { NovelDirectorAutoExecutionRuntime } from "./autoExecutionRuntime";
import {
  buildDirectorSessionState,
  getDirectorInputFromSeedPayload,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "./helpers";

function mergeResumeTargets(
  primary: ReturnType<typeof parseResumeTarget>,
  fallback: ReturnType<typeof parseResumeTarget>,
) {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }
  return {
    ...fallback,
    ...primary,
    stage: primary.stage === "basic" && fallback.stage !== "basic"
      ? fallback.stage
      : primary.stage,
    chapterId: primary.chapterId ?? fallback.chapterId ?? null,
    volumeId: primary.volumeId ?? fallback.volumeId ?? null,
  };
}

function parseResumeTargetLike(value: unknown) {
  if (typeof value === "string") {
    return parseResumeTarget(value);
  }
  if (value && typeof value === "object") {
    return value as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

function shouldForceAutoExecutionContinuation(mode?: DirectorContinuationMode): boolean {
  return mode === "auto_execute_range" || mode === "auto_execute_front10";
}

function resolveContinuationDirectorInput(
  input: DirectorConfirmRequest,
  continuationMode?: DirectorContinuationMode,
): DirectorConfirmRequest {
  if (!shouldForceAutoExecutionContinuation(continuationMode) || input.runMode === "auto_to_execution") {
    return input;
  }
  return {
    ...input,
    runMode: "auto_to_execution",
  };
}

export interface DirectorContinueTaskFlowDeps {
  workflowService: NovelWorkflowService;
  autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  continueCandidateStageTask: (taskId: string, input: {
    novelId?: string | null;
    status: string;
    checkpointType: string | null;
    currentItemKey?: string | null;
    seedPayload: DirectorWorkflowSeedPayload;
  }) => Promise<boolean>;
  resolveAssetFirstRecovery: (input: {
    novelId: string;
    directorInput: DirectorConfirmRequest;
  }) => Promise<
    | {
      type: "auto_execution";
      resumeCheckpointType: "front10_ready" | "chapter_batch_ready" | "replan_required";
    }
    | {
      type: "phase";
      phase: "structured_outline";
    }
    | null
  >;
  resolveResumePhase: (input: {
    novelId: string;
    checkpointType: string | null;
    directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready";
  }) => Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline">;
  resolveDirectorEditStage: (
    phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready",
  ) => "story_macro" | "character" | "outline" | "structured" | "chapter";
  assertHighMemoryDirectorStartAllowed: (input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  runDirectorPipeline: (input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
}

export async function continueTask(
  deps: DirectorContinueTaskFlowDeps,
  taskId: string,
  input?: {
    continuationMode?: DirectorContinuationMode;
    batchAlreadyStartedCount?: number;
    forceResumeRunning?: boolean;
  },
): Promise<void> {
  const row = await deps.workflowService.getTaskById(taskId);
  if (!row) {
    throw new Error("自动导演任务不存在。");
  }
  if (row.lane !== "auto_director") {
    await deps.workflowService.continueTask(taskId);
    return;
  }
  if (row.status === "running" && !row.pendingManualRecovery && input?.forceResumeRunning !== true) {
    return;
  }

  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
  const storedDirectorInput = getDirectorInputFromSeedPayload(seedPayload);
  const directorInput = storedDirectorInput
    ? resolveContinuationDirectorInput(storedDirectorInput, input?.continuationMode)
    : null;
  const novelId = row.novelId ?? seedPayload.novelId ?? null;
  const resumedCandidateStage = await deps.continueCandidateStageTask(taskId, {
    novelId,
    status: row.status,
    checkpointType: row.checkpointType,
    currentItemKey: row.currentItemKey,
    seedPayload,
  });
  if (resumedCandidateStage) {
    return;
  }
  if (!directorInput || !novelId) {
    throw new Error("自动导演任务缺少恢复所需上下文。");
  }
  const assetFirstRecovery = await deps.resolveAssetFirstRecovery({
    novelId,
    directorInput,
  });
  const fallbackRunMode = typeof seedPayload.runMode === "string"
    && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
    ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
    : undefined;
  const runMode = normalizeDirectorRunMode(directorInput.runMode ?? fallbackRunMode);
  const shouldResumeStoredBatchCheckpoint = runMode === "auto_to_execution"
    && (row.checkpointType === "chapter_batch_ready" || row.checkpointType === "replan_required");
  const canSkipReviewBlockedChapter = (
    row.status === "failed"
    || row.status === "cancelled"
  ) && (
    input?.continuationMode === "auto_execute_range"
    || input?.continuationMode === "auto_execute_front10"
  );
  if (
    assetFirstRecovery?.type === "auto_execution"
    || shouldResumeStoredBatchCheckpoint
  ) {
    const resumeCheckpointType = assetFirstRecovery?.type === "auto_execution"
      ? assetFirstRecovery.resumeCheckpointType
      : (
        row.checkpointType === "chapter_batch_ready" || row.checkpointType === "replan_required"
          ? row.checkpointType
          : "front10_ready"
      );
    const resumedChapterId = (
      parseResumeTargetLike(row.resumeTargetJson)?.chapterId
      ?? parseResumeTargetLike(seedPayload.resumeTarget)?.chapterId
      ?? seedPayload.autoExecution?.nextChapterId
      ?? null
    );
    await deps.workflowService.markTaskRunning(taskId, {
      stage: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
      itemKey: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
      itemLabel: resumeCheckpointType === "replan_required"
        ? "正在恢复当前质量修复批次"
        : "正在恢复当前章节批次",
      progress: resumeCheckpointType === "replan_required" ? 0.975 : 0.93,
      clearCheckpoint: resumeCheckpointType === "chapter_batch_ready" || resumeCheckpointType === "replan_required",
      seedPayload: deps.buildDirectorSeedPayload(directorInput, novelId, {
        directorSession: buildDirectorSessionState({
          runMode: directorInput.runMode,
          phase: "front10_ready",
          isBackgroundRunning: true,
        }),
        resumeTarget: buildNovelEditResumeTarget({
          novelId,
          taskId,
          stage: "pipeline",
          chapterId: resumedChapterId,
        }),
        autoExecution: seedPayload.autoExecution ?? null,
      }),
    });
    deps.scheduleBackgroundRun(taskId, async () => {
      await deps.autoExecutionRuntime.runFromReady({
        taskId,
        novelId,
        request: directorInput,
        existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
        existingState: seedPayload.autoExecution ?? null,
        resumeCheckpointType,
        previousFailureMessage: row.lastError ?? null,
        allowSkipReviewBlockedChapter: canSkipReviewBlockedChapter,
      });
    });
    return;
  }

  const phase = assetFirstRecovery?.type === "phase"
    ? assetFirstRecovery.phase
    : await deps.resolveResumePhase({
      novelId,
      checkpointType: row.checkpointType,
      directorSessionPhase: seedPayload.directorSession?.phase,
    });

  const directorSession = buildDirectorSessionState({
    runMode: directorInput.runMode,
    phase,
    isBackgroundRunning: true,
  });
  const resumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: deps.resolveDirectorEditStage(phase),
  });
  const recoveryResumeTarget = mergeResumeTargets(
    parseResumeTargetLike(row.resumeTargetJson),
    parseResumeTargetLike(seedPayload.resumeTarget),
  );
  if (phase === "structured_outline") {
    await deps.assertHighMemoryDirectorStartAllowed({
      taskId,
      novelId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      volumeId: recoveryResumeTarget?.volumeId,
      chapterId: recoveryResumeTarget?.chapterId,
      scope: recoveryResumeTarget?.volumeId || recoveryResumeTarget?.chapterId ? null : "book",
      batchAlreadyStartedCount: input?.batchAlreadyStartedCount,
    });
  }
  await deps.workflowService.bootstrapTask({
    workflowTaskId: taskId,
    novelId,
    lane: "auto_director",
    title: directorInput.candidate.workingTitle,
    seedPayload: deps.buildDirectorSeedPayload(directorInput, novelId, {
      directorSession,
      resumeTarget,
    }),
  });
  await deps.workflowService.markTaskRunning(taskId, {
    ...({
      story_macro: { stage: "story_macro", itemKey: "book_contract", itemLabel: "正在恢复故事宏观规划", progress: 0.12 },
      character_setup: { stage: "character_setup", itemKey: "character_setup", itemLabel: "正在恢复角色准备", progress: 0.28 },
      volume_strategy: { stage: "volume_strategy", itemKey: "volume_strategy", itemLabel: "正在恢复卷战略规划", progress: 0.48 },
      structured_outline: { stage: "structured_outline", itemKey: "chapter_list", itemLabel: "正在恢复章节大纲", progress: 0.68 },
    } as const)[phase],
  });
  deps.scheduleBackgroundRun(taskId, async () => {
    await deps.runDirectorPipeline({
      taskId,
      novelId,
      input: directorInput,
      startPhase: phase,
      scope: normalizeDirectorMemoryScope({
        volumeId: recoveryResumeTarget?.volumeId,
        chapterId: recoveryResumeTarget?.chapterId,
        fallback: recoveryResumeTarget?.volumeId || recoveryResumeTarget?.chapterId ? null : "book",
      }),
      batchAlreadyStartedCount: input?.batchAlreadyStartedCount,
    });
  });
}
