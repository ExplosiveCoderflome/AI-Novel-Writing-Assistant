import type {
  DirectorAutoExecutionState,
  DirectorSessionState,
  DirectorTakeoverEntryStep,
  DirectorTakeoverRequest,
  DirectorTakeoverResponse,
} from "@ai-novel/shared/types/novelDirector";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import {
  resolveDirectorTakeoverPlan,
  type DirectorTakeoverResolvedPlan,
} from "./novelDirectorTakeover";
import type { DirectorTakeoverLoadedState } from "./novelDirectorTakeoverRuntime";
import { resolveDirectorRunningStateForPhase } from "./novelDirectorTakeoverRuntime";

interface TakeoverBootstrapTaskResult {
  id: string;
}

interface RewriteSnapshotReference {
  snapshotId: string;
  label: string;
  restoreEntry?: string | null;
}

interface TakeoverExecutionWorkflowPort {
  bootstrapTask(input: {
    novelId: string;
    lane: "auto_director";
    title: string;
    forceNew: true;
    seedPayload: Record<string, unknown>;
  }): Promise<TakeoverBootstrapTaskResult>;
  markTaskRunning(taskId: string, input: {
    stage: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "chapter_execution" | "quality_repair";
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
  }): Promise<unknown>;
}

interface TakeoverExecutionAutoRuntimePort {
  prepareRequestedAutoExecution(input: {
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
  }): Promise<unknown>;
  runFromReady(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
    resumeStage?: "chapter" | "pipeline";
  }): Promise<void>;
}

interface StartDirectorTakeoverExecutionInput {
  request: DirectorTakeoverRequest;
  takeoverState: DirectorTakeoverLoadedState;
  directorInput: DirectorConfirmRequest;
  workflowService: TakeoverExecutionWorkflowPort;
  autoExecutionRuntime: TakeoverExecutionAutoRuntimePort;
  buildDirectorSeedPayload: (
    request: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  runDirectorPipeline: (input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  }) => Promise<void>;
  assertHighMemoryStartAllowed?: (input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
  createRewriteSnapshot?: (input: {
    novelId: string;
    label: string;
  }) => Promise<RewriteSnapshotReference>;
  recordRewriteSnapshotMilestone?: (input: {
    taskId: string;
    snapshot: RewriteSnapshotReference;
    summary: string;
  }) => Promise<unknown>;
  prepareRestartStep?: (input: {
    request: DirectorTakeoverRequest;
    takeoverState: DirectorTakeoverLoadedState;
    directorInput: DirectorConfirmRequest;
    plan: DirectorTakeoverResolvedPlan;
  }) => Promise<void>;
}

function startPhaseToEntryStep(startPhase: NonNullable<DirectorTakeoverRequest["startPhase"]>): DirectorTakeoverEntryStep {
  if (startPhase === "story_macro") return "story_macro";
  if (startPhase === "character_setup") return "character";
  if (startPhase === "volume_strategy") return "outline";
  return "structured";
}

function normalizeTakeoverSelection(
  request: DirectorTakeoverRequest,
): {
  entryStep: DirectorTakeoverEntryStep;
  strategy: "continue_existing" | "restart_current_step";
} {
  const entryStep = request.entryStep
    ?? (request.startPhase ? startPhaseToEntryStep(request.startPhase) : "basic");
  const strategy = request.strategy
    ?? (request.startPhase ? "restart_current_step" : "continue_existing");
  return {
    entryStep,
    strategy,
  };
}

function buildResumeTargetFromPlan(input: {
  novelId: string;
  workflowTaskId?: string | null;
  takeoverState: DirectorTakeoverLoadedState;
  plan: DirectorTakeoverResolvedPlan;
}) {
  return buildNovelEditResumeTarget({
    novelId: input.novelId,
    taskId: input.workflowTaskId ?? undefined,
    stage: input.plan.resumeStage,
    volumeId: input.takeoverState.latestCheckpoint?.volumeId
      ?? (input.plan.resumeStage === "structured" ? input.takeoverState.snapshot.firstVolumeId : null)
      ?? input.takeoverState.snapshot.firstVolumeId
      ?? null,
    chapterId: input.takeoverState.latestCheckpoint?.chapterId
      ?? input.takeoverState.executableRange?.nextChapterId
      ?? input.takeoverState.latestAutoExecutionState?.nextChapterId
      ?? null,
  });
}

function buildTakeoverMetadata(plan: DirectorTakeoverResolvedPlan) {
  return {
    source: "existing_novel",
    startPhase: plan.startPhase,
    entryStep: plan.entryStep,
    strategy: plan.strategy,
    effectiveStep: plan.effectiveStep,
    effectiveStage: plan.effectiveStage,
  };
}

function buildAutoExecutionRunningState(plan: DirectorTakeoverResolvedPlan): {
  stage: "chapter_execution" | "quality_repair";
  itemKey: "chapter_execution" | "quality_repair";
  itemLabel: string;
  progress: number;
} {
  if (plan.effectiveStage === "quality_repair") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: plan.usesCurrentBatch ? "正在恢复当前质量修复批次" : "正在启动新的质量修复批次",
      progress: 0.975,
    };
  }
  return {
    stage: "chapter_execution",
    itemKey: "chapter_execution",
    itemLabel: plan.usesCurrentBatch ? "正在恢复当前章节批次" : "正在启动新的章节批次",
    progress: 0.93,
  };
}

const REWRITE_SNAPSHOT_LABEL = "自动导演重写前备份";

async function createRewriteSnapshotForRestart(
  input: StartDirectorTakeoverExecutionInput,
): Promise<RewriteSnapshotReference> {
  if (!input.createRewriteSnapshot) {
    throw new Error("无法创建自动导演重写前备份：快照服务未配置");
  }
  try {
    return await input.createRewriteSnapshot({
      novelId: input.request.novelId,
      label: REWRITE_SNAPSHOT_LABEL,
    });
  } catch (error) {
    const cause = error instanceof Error && error.message ? `：${error.message}` : "";
    throw new Error(`无法创建自动导演重写前备份${cause}`);
  }
}

export async function startDirectorTakeoverExecution(
  input: StartDirectorTakeoverExecutionInput,
): Promise<DirectorTakeoverResponse> {
  const selection = normalizeTakeoverSelection(input.request);
  const plan = resolveDirectorTakeoverPlan({
    entryStep: selection.entryStep,
    strategy: selection.strategy,
    snapshot: input.takeoverState.snapshot,
    activePipelineJob: input.takeoverState.activePipelineJob,
    latestCheckpoint: input.takeoverState.latestCheckpoint,
    executableRange: input.takeoverState.executableRange,
  });

  const directorSession: DirectorSessionState = buildDirectorSessionState({
    runMode: input.directorInput.runMode,
    phase: plan.executionMode === "phase" ? plan.phase ?? plan.startPhase : "front10_ready",
    isBackgroundRunning: true,
  });

  let rewriteSnapshot: RewriteSnapshotReference | null = null;
  if (selection.strategy === "restart_current_step") {
    rewriteSnapshot = await createRewriteSnapshotForRestart(input);
    await input.prepareRestartStep?.({
      request: input.request,
      takeoverState: input.takeoverState,
      directorInput: input.directorInput,
      plan,
    });
  }

  const initialResumeTarget = buildResumeTargetFromPlan({
    novelId: input.request.novelId,
    takeoverState: input.takeoverState,
    plan,
  });

  const workflowTask = await input.workflowService.bootstrapTask({
    novelId: input.request.novelId,
    lane: "auto_director",
    title: input.takeoverState.novel.title,
    forceNew: true,
    seedPayload: input.buildDirectorSeedPayload(input.directorInput, input.request.novelId, {
      directorSession,
      resumeTarget: initialResumeTarget,
      takeover: buildTakeoverMetadata(plan),
      ...(rewriteSnapshot ? { rewriteSnapshot } : {}),
    }),
  });

  if (rewriteSnapshot) {
    await input.recordRewriteSnapshotMilestone?.({
      taskId: workflowTask.id,
      snapshot: rewriteSnapshot,
      summary: `${rewriteSnapshot.label}已创建：${rewriteSnapshot.snapshotId}`,
    });
  }

  const resumeTarget = buildResumeTargetFromPlan({
    novelId: input.request.novelId,
    workflowTaskId: workflowTask.id,
    takeoverState: input.takeoverState,
    plan,
  });

  if (plan.executionMode === "phase") {
    if ((plan.phase ?? plan.startPhase) === "structured_outline") {
      await input.assertHighMemoryStartAllowed?.({
        taskId: workflowTask.id,
        novelId: input.request.novelId,
        stage: "structured_outline",
        itemKey: "chapter_list",
        volumeId: input.takeoverState.latestCheckpoint?.volumeId
          ?? input.takeoverState.snapshot.firstVolumeId
          ?? null,
        chapterId: input.takeoverState.latestCheckpoint?.chapterId ?? null,
        scope: "book",
      });
    }
    await input.workflowService.markTaskRunning(workflowTask.id, resolveDirectorRunningStateForPhase(plan.phase ?? plan.startPhase));
    input.scheduleBackgroundRun(workflowTask.id, async () => {
      await input.runDirectorPipeline({
        taskId: workflowTask.id,
        novelId: input.request.novelId,
        input: input.directorInput,
        startPhase: plan.phase ?? plan.startPhase,
      });
    });
  } else {
    await input.autoExecutionRuntime.prepareRequestedAutoExecution({
      novelId: input.request.novelId,
      request: input.directorInput,
      existingPipelineJobId: plan.usesCurrentBatch ? (input.takeoverState.activePipelineJob?.id ?? null) : null,
      existingState: plan.usesCurrentBatch ? (input.takeoverState.latestAutoExecutionState ?? null) : null,
    });
    await input.workflowService.markTaskRunning(workflowTask.id, buildAutoExecutionRunningState(plan));
    input.scheduleBackgroundRun(workflowTask.id, async () => {
      await input.autoExecutionRuntime.runFromReady({
        taskId: workflowTask.id,
        novelId: input.request.novelId,
        request: input.directorInput,
        existingPipelineJobId: plan.usesCurrentBatch ? (input.takeoverState.activePipelineJob?.id ?? null) : null,
        existingState: plan.usesCurrentBatch ? (input.takeoverState.latestAutoExecutionState ?? null) : null,
        resumeCheckpointType: plan.usesCurrentBatch ? (plan.resumeCheckpointType ?? null) : null,
        resumeStage: plan.resumeStage === "pipeline" ? "pipeline" : "chapter",
      });
    });
  }

  return {
    novelId: input.request.novelId,
    workflowTaskId: workflowTask.id,
    startPhase: plan.startPhase,
    entryStep: selection.entryStep,
    strategy: selection.strategy,
    effectiveStage: plan.effectiveStage,
    directorSession,
    resumeTarget: {
      ...resumeTarget,
      taskId: workflowTask.id,
    },
  };
}
