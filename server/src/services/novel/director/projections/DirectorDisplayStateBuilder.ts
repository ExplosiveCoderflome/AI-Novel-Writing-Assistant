import type {
  DirectorChapterExecutionProgressSummary,
  DirectorDisplayMode,
  DirectorDisplayStageKey,
  DirectorDisplayState,
  DirectorDisplayStep,
  DirectorRuntimeProjection,
  DirectorTaskFactSummary,
} from "@ai-novel/shared/types/directorRuntime";
import {
  getWorkflowCheckpointLabel,
  resolveWorkflowDisplayStage,
  WORKFLOW_DISPLAY_STAGES,
} from "@ai-novel/shared/types/directorWorkflowStepCatalog";
import type { WorkflowStepProgress } from "../workflowStepRuntime/WorkflowStepModule";

type FactStepStateLike = {
  module: {
    id: string;
    label: string;
  };
  facts: {
    nextAction?: string | null;
  };
  progress: WorkflowStepProgress;
} | null;

type SnapshotTaskLike = {
  status: string;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  progress?: number | null;
  checkpointType?: string | null;
  checkpointSummary?: string | null;
  lastError?: string | null;
  pendingManualRecovery?: boolean | null;
};

const DISPLAY_STAGES: Array<{ key: DirectorDisplayStageKey; label: string }> = WORKFLOW_DISPLAY_STAGES.map((stage) => ({
  key: stage.key,
  label: stage.label,
}));

function clampPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function buildCheckpointLabel(task: SnapshotTaskLike): string {
  return getWorkflowCheckpointLabel({
    checkpointType: task.checkpointType,
    status: task.status,
    fallback: task.checkpointSummary,
  });
}

function hasLiveRuntimeProgress(task: SnapshotTaskLike, projection: DirectorRuntimeProjection | null): boolean {
  return Boolean(
    task.status === "running"
    && (
      projection?.status === "running"
      || projection?.status === "waiting_approval"
      || projection?.currentLabel?.trim()
      || typeof projection?.progressBreakdown?.activeJobProgress === "number"
      || typeof projection?.progressBreakdown?.totalPercent === "number"
    ),
  );
}

function buildMode(input: {
  task: SnapshotTaskLike;
  projection: DirectorRuntimeProjection | null;
  factSummary?: DirectorTaskFactSummary | null;
  showPendingManualRecovery: boolean;
}): DirectorDisplayMode {
  if (input.showPendingManualRecovery) {
    return "needs_recovery";
  }
  if (
    input.projection?.status === "failed"
    || input.task.status === "failed"
    || input.task.status === "cancelled"
  ) {
    return "failed";
  }
  if (
    input.task.status === "waiting_approval"
    || input.projection?.status === "waiting_approval"
    || input.projection?.status === "blocked"
    || input.projection?.requiresUserAction
  ) {
    return "waiting";
  }
  if (
    input.projection?.status === "running"
    || input.task.status === "running"
    || input.task.status === "queued"
  ) {
    return "running";
  }
  if (input.factSummary) {
    return input.factSummary.allStepsCompleted ? "completed" : "idle";
  }
  if (input.task.checkpointType === "workflow_completed") {
    return "completed";
  }
  return "idle";
}

function buildDescription(mode: DirectorDisplayMode): string {
  switch (mode) {
    case "needs_recovery":
      return "后台执行器连接中断后正在恢复，系统会优先从最近进度继续。";
    case "waiting":
      return "当前导演流程停在需要确认的位置。你可以先查看结果，再决定是否继续。";
    case "failed":
      return "当前导演流程停在最近一步。可以先查看执行详情，再决定是否重试或继续。";
    case "completed":
      return "本轮导演流程已收尾，你可以继续推进章节、查看结果，或发起下一轮自动导演。";
    case "running":
      return "AI 正在后台接管这本书的开书流程。你可以继续手动操作当前项目；如果与自动导演同时改同一块内容，以最新写入结果为准。";
    default:
      return "当前没有正在推进的导演任务。";
  }
}

function buildHeadline(mode: DirectorDisplayMode): string {
  switch (mode) {
    case "needs_recovery":
      return "等待恢复";
    case "waiting":
      return "等待确认";
    case "failed":
      return "执行受阻";
    case "completed":
      return "导演已完成";
    case "running":
      return "正在自动导演";
    default:
      return "暂未启动";
  }
}

function buildCurrentAction(input: {
  mode: DirectorDisplayMode;
  projection: DirectorRuntimeProjection | null;
  factStep: FactStepStateLike;
  task: SnapshotTaskLike;
}): string {
  if (input.mode === "needs_recovery") {
    return (
      input.task.lastError?.trim()
      || input.projection?.blockingReason?.trim()
      || input.projection?.lastEventSummary?.trim()
      || "系统会从最近进度继续恢复。"
    );
  }
  return (
    input.projection?.currentLabel?.trim()
    || input.projection?.currentAction?.trim()
    || input.factStep?.progress.label?.trim()
    || input.task.currentItemLabel?.trim()
    || input.projection?.lastEventSummary?.trim()
    || "等待同步当前推进状态"
  );
}

function buildNextActionLabel(input: {
  projection: DirectorRuntimeProjection | null;
  factStep: FactStepStateLike;
}): string | null {
  const raw = input.projection?.nextActionLabel?.trim()
    || input.factStep?.progress.nextAction?.trim()
    || input.factStep?.facts.nextAction?.trim()
    || null;
  if (!raw) {
    return null;
  }
  switch (raw) {
    case "continue":
      return "继续自动导演";
    case "continue_chapter_execution":
      return "继续章节执行";
    case "resume_from_checkpoint":
      return "从最近进度恢复";
    case "approve_gate":
      return "确认并继续";
    case "repair_chapter":
      return "修复当前章节";
    case "run_quality_review":
      return "进入质量检查";
    case "run_chapter_execution":
      return "开始章节执行";
    case "sync_execution_contracts":
      return "同步正式章节执行上下文";
    default:
      return raw;
  }
}

function buildProgressPercent(input: {
  task: SnapshotTaskLike;
  projection: DirectorRuntimeProjection | null;
  chapterProgress: DirectorChapterExecutionProgressSummary | null | undefined;
}): number {
  if (typeof input.projection?.progressBreakdown?.totalPercent === "number") {
    return clampPercent(input.projection.progressBreakdown.totalPercent);
  }
  if (typeof input.task.progress === "number") {
    return clampPercent(input.task.progress);
  }
  if (typeof input.chapterProgress?.ratio === "number") {
    return clampPercent(input.chapterProgress.ratio * 100);
  }
  return 0;
}

function buildSteps(currentStageKey: DirectorDisplayStageKey, mode: DirectorDisplayMode): DirectorDisplayStep[] {
  const currentIndex = DISPLAY_STAGES.findIndex((stage) => stage.key === currentStageKey);
  return DISPLAY_STAGES.map((stage, index) => {
    let status: DirectorDisplayStep["status"] = "pending";
    if (mode === "completed") {
      status = "completed";
    } else if (index < currentIndex) {
      status = "completed";
    } else if (index === currentIndex) {
      status = mode === "waiting" || mode === "needs_recovery" || mode === "failed"
        ? "attention"
        : "running";
    }
    return {
      key: stage.key,
      label: stage.label,
      status,
      isCurrent: index === currentIndex,
    };
  });
}

export function buildDirectorDisplayState(input: {
  task: SnapshotTaskLike;
  projection: DirectorRuntimeProjection | null;
  factSummary?: DirectorTaskFactSummary | null;
  activeStepNodeKey?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  factStep: FactStepStateLike;
  chapterProgress?: DirectorChapterExecutionProgressSummary | null;
}): DirectorDisplayState {
  const isLiveRunning = hasLiveRuntimeProgress(input.task, input.projection);
  const needsRecovery = Boolean(input.task.pendingManualRecovery) && !isLiveRunning;
  const stageKey = resolveWorkflowDisplayStage({
    factStepId: input.currentFactStepId ?? input.projection?.currentFactStepId ?? null,
    currentNodeKey: input.projection?.currentNodeKey ?? null,
    activeNodeKey: input.activeStepNodeKey ?? null,
    taskCurrentItemKey: input.task.currentItemKey ?? null,
    checkpointType: input.task.checkpointType ?? null,
    taskStatus: input.task.status ?? null,
    currentStage: input.task.currentStage ?? null,
  });
  const stage = DISPLAY_STAGES.find((item) => item.key === stageKey) ?? DISPLAY_STAGES[0];
  const mode = buildMode({
    task: input.task,
    projection: input.projection,
    factSummary: input.factSummary ?? null,
    showPendingManualRecovery: needsRecovery,
  });
  const stepIndex = Math.max(0, DISPLAY_STAGES.findIndex((item) => item.key === stage.key));
  return {
    stageKey: stage.key,
    stageLabel: stage.label,
    stepIndex,
    totalSteps: DISPLAY_STAGES.length,
    mode,
    headline: buildHeadline(mode),
    description: buildDescription(mode),
    currentAction: buildCurrentAction({
      mode,
      projection: input.projection,
      factStep: input.factStep,
      task: input.task,
    }),
    checkpointLabel: buildCheckpointLabel(input.task),
    progressPercent: buildProgressPercent({
      task: input.task,
      projection: input.projection,
      chapterProgress: input.chapterProgress ?? null,
    }),
    nextActionLabel: buildNextActionLabel({
      projection: input.projection,
      factStep: input.factStep,
    }),
    currentFactStepId: input.currentFactStepId ?? input.projection?.currentFactStepId ?? null,
    currentFactStepLabel: input.currentFactStepLabel ?? input.projection?.currentFactStepLabel ?? null,
    currentFactDescription: input.factStep?.progress.label ?? input.projection?.currentLabel ?? null,
    requiresUserAction: Boolean(
      input.projection?.requiresUserAction
      || input.projection?.status === "blocked"
      || input.projection?.status === "waiting_approval",
    ),
    isLiveRunning,
    needsRecovery,
    steps: buildSteps(stage.key, mode),
  };
}
