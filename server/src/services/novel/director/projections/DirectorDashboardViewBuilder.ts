import type {
  DirectorChapterExecutionProgressSummary,
  DirectorDashboardAction,
  DirectorDashboardDiagnostic,
  DirectorDashboardMode,
  DirectorDashboardProgressSource,
  DirectorDashboardView,
  DirectorDisplayState,
  DirectorRuntimeProjection,
  DirectorTaskFactSummary,
  DirectorWorkerHealthSummary,
} from "@ai-novel/shared/types/directorRuntime";

type DashboardTaskLike = {
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

type DashboardStepLike = {
  status?: string | null;
  nodeKey?: string | null;
  label?: string | null;
} | null;

type DashboardCommandLike = {
  status?: string | null;
  commandType?: string | null;
} | null;

function clampPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function progressFromTask(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return clampPercent(value > 0 && value <= 1 ? value * 100 : value);
}

function hasLiveRunningEvidence(input: {
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  activeStep?: DashboardStepLike;
  latestCommand?: DashboardCommandLike;
  workerHealth?: DirectorWorkerHealthSummary | null;
}): boolean {
  const workerState = input.workerHealth?.derivedState ?? null;
  const commandStatus = input.latestCommand?.status ?? null;
  const activeStepStatus = input.activeStep?.status ?? null;
  return Boolean(
    workerState === "running_step"
    || workerState === "leased_starting"
    || (
      input.task.status === "running"
      && (
        input.task.currentItemLabel?.trim()
        || input.task.currentItemKey?.trim()
        || input.task.currentStage?.trim()
        || input.projection?.status === "running"
        || input.projection?.currentLabel?.trim()
        || input.projection?.lastEventSummary?.trim()
        || activeStepStatus === "running"
        || commandStatus === "leased"
        || commandStatus === "running"
        || commandStatus === "queued"
      )
    ),
  );
}

function checkpointNeedsUser(task: DashboardTaskLike): boolean {
  return task.status === "waiting_approval";
}

function buildMode(input: {
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  displayState: DirectorDisplayState;
  activeStep?: DashboardStepLike;
  latestCommand?: DashboardCommandLike;
  workerHealth?: DirectorWorkerHealthSummary | null;
  factSummary?: DirectorTaskFactSummary | null;
}): DirectorDashboardMode {
  const liveRunning = hasLiveRunningEvidence(input);
  const workerState = input.workerHealth?.derivedState ?? null;
  if (input.task.status === "failed" || input.task.status === "cancelled") {
    return "failed";
  }
  if (workerState === "queued_waiting_worker") {
    return "queued";
  }
  if (workerState === "auto_recovering" && !liveRunning) {
    return "recovering";
  }
  if (
    input.task.pendingManualRecovery
    && workerState !== "running_step"
    && workerState !== "leased_starting"
  ) {
    return "recovering";
  }
  if (input.task.pendingManualRecovery && !liveRunning) {
    return "recovering";
  }
  if (checkpointNeedsUser(input.task)) {
    return "waiting_user";
  }
  if (liveRunning || input.task.status === "running") {
    return "running";
  }
  if (
    input.task.status === "queued"
    || input.latestCommand?.status === "queued"
  ) {
    return "queued";
  }
  if (
    input.projection?.status === "failed"
    && !liveRunning
    && input.task.status !== "queued"
    && input.task.status !== "running"
    && input.task.status !== "waiting_approval"
  ) {
    return "failed";
  }
  if (
    input.task.status === "succeeded"
    || input.task.checkpointType === "workflow_completed"
    || input.projection?.status === "completed"
    || input.factSummary?.allStepsCompleted
  ) {
    return "completed";
  }
  return "idle";
}

function statusLabel(mode: DirectorDashboardMode): string {
  switch (mode) {
    case "queued":
      return "等待执行";
    case "running":
      return "AI 接管中";
    case "waiting_user":
      return "等待确认";
    case "recovering":
      return "等待恢复";
    case "failed":
      return "执行异常";
    case "completed":
      return "已完成";
    default:
      return "暂未启动";
  }
}

function headlineForMode(mode: DirectorDashboardMode, displayState: DirectorDisplayState): string {
  switch (mode) {
    case "queued":
      return "等待自动导演";
    case "running":
      return "正在自动导演";
    case "waiting_user":
      return "等待确认";
    case "recovering":
      return "等待恢复";
    case "failed":
      return "执行受阻";
    case "completed":
      return "导演已完成";
    default:
      return displayState.headline;
  }
}

function descriptionForMode(mode: DirectorDashboardMode, displayState: DirectorDisplayState): string {
  switch (mode) {
    case "queued":
      return "任务已进入后台队列，执行器领取后会继续推进。";
    case "running":
      return "AI 正在后台接管这本书的开书流程。你可以继续手动操作当前项目；如果与自动导演同时改同一块内容，以最新写入结果为准。";
    case "waiting_user":
      return "当前导演流程停在需要确认的位置。你可以先查看结果，再决定是否继续。";
    case "recovering":
      return "后台执行器连接中断后正在恢复，系统会优先从最近进度继续。";
    case "failed":
      return "当前导演流程停在最近一步。可以先查看执行详情，再决定是否重试或继续。";
    case "completed":
      return "本轮导演流程已收尾，你可以继续推进章节、查看结果，或发起下一轮自动导演。";
    default:
      return displayState.description;
  }
}

function buildProgress(input: {
  mode: DirectorDashboardMode;
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  chapterProgress?: DirectorChapterExecutionProgressSummary | null;
  displayState: DirectorDisplayState;
}): { percent: number; source: DirectorDashboardProgressSource } {
  const taskPercent = progressFromTask(input.task.progress);
  if (input.mode === "running" && taskPercent !== null) {
    return { percent: taskPercent, source: "task_live" };
  }
  if (input.mode === "waiting_user" && taskPercent !== null) {
    return { percent: taskPercent, source: "checkpoint" };
  }
  if (typeof input.projection?.progressBreakdown?.activeJobProgress === "number" && input.mode === "running") {
    return {
      percent: clampPercent(input.projection.progressBreakdown.activeJobProgress),
      source: "worker_live",
    };
  }
  if (typeof input.chapterProgress?.ratio === "number") {
    return {
      percent: clampPercent(input.chapterProgress.ratio * 100),
      source: "chapter_facts",
    };
  }
  if (typeof input.projection?.progressBreakdown?.totalPercent === "number") {
    return {
      percent: clampPercent(input.projection.progressBreakdown.totalPercent),
      source: "runtime_projection",
    };
  }
  return {
    percent: clampPercent(input.displayState.progressPercent),
    source: "fallback",
  };
}

function buildCurrentAction(input: {
  mode: DirectorDashboardMode;
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  displayState: DirectorDisplayState;
}): string | null {
  const staleActionProjection = Boolean(
    input.mode === "running"
    && (
      input.projection?.requiresUserAction
      || input.projection?.status === "blocked"
      || input.projection?.status === "waiting_approval"
      || input.projection?.status === "failed"
    ),
  );
  if (input.mode === "recovering") {
    return input.task.lastError?.trim()
      || input.projection?.blockingReason?.trim()
      || input.projection?.lastEventSummary?.trim()
      || "系统会从最近进度继续恢复。";
  }
  if (input.mode === "running") {
    return (staleActionProjection ? null : input.projection?.currentLabel?.trim())
      || input.task.currentItemLabel?.trim()
      || input.projection?.currentAction?.trim()
      || input.displayState.currentAction
      || null;
  }
  return input.displayState.currentAction
    || input.projection?.currentLabel?.trim()
    || input.task.currentItemLabel?.trim()
    || null;
}

function action(type: DirectorDashboardAction["type"], label: string, emphasis: DirectorDashboardAction["emphasis"]): DirectorDashboardAction {
  return { type, label, emphasis };
}

function buildActions(mode: DirectorDashboardMode): {
  primaryAction: DirectorDashboardAction | null;
  secondaryActions: DirectorDashboardAction[];
} {
  if (mode === "waiting_user") {
    return {
      primaryAction: action("confirm_and_continue", "确认并继续", "primary"),
      secondaryActions: [action("open_task_center", "查看执行详情", "secondary")],
    };
  }
  if (mode === "failed") {
    return {
      primaryAction: action("open_task_center", "查看执行详情", "primary"),
      secondaryActions: [action("resume_from_checkpoint", "从最近进度恢复", "secondary")],
    };
  }
  if (mode === "recovering") {
    return {
      primaryAction: action("open_task_center", "查看执行详情", "primary"),
      secondaryActions: [],
    };
  }
  if (mode === "running" || mode === "queued") {
    return {
      primaryAction: action("open_task_center", "查看执行详情", "primary"),
      secondaryActions: mode === "running"
        ? [action("background_continue", "后台继续", "secondary")]
        : [],
    };
  }
  return {
    primaryAction: action("open_task_center", "查看执行详情", "primary"),
    secondaryActions: [],
  };
}

function buildDiagnostics(input: {
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  mode: DirectorDashboardMode;
  liveRunning: boolean;
}): DirectorDashboardDiagnostic[] {
  const diagnostics: DirectorDashboardDiagnostic[] = [];
  if (input.task.pendingManualRecovery && input.liveRunning) {
    diagnostics.push({
      code: "stale_recovery_flag_ignored",
      label: "恢复标记已被实时进度覆盖",
      detail: input.task.lastError ?? null,
      level: "info",
      source: "task",
    });
  }
  if (
    input.liveRunning
    && (
      input.projection?.status === "waiting_approval"
      || input.projection?.status === "blocked"
      || input.projection?.requiresUserAction
      || input.projection?.status === "failed"
    )
  ) {
    diagnostics.push({
      code: "stale_action_projection_ignored",
      label: "历史等待信号已被实时进度覆盖",
      detail: input.projection?.blockedReason ?? input.projection?.detail ?? null,
      level: "info",
      source: "projection",
    });
  }
  for (const badge of input.projection?.visibleRiskBadges ?? []) {
    diagnostics.push({
      code: `risk:${badge.label}`,
      label: badge.label,
      detail: null,
      level: badge.level,
      source: badge.source === "artifact" ? "artifact" : "projection",
    });
  }
  if (input.projection?.scopeSummary) {
    diagnostics.push({
      code: "scope_summary",
      label: "工作区摘要",
      detail: input.projection.scopeSummary,
      level: "info",
      source: "projection",
    });
  }
  return diagnostics.slice(0, 8);
}

export function buildDirectorDashboardView(input: {
  task: DashboardTaskLike;
  projection: DirectorRuntimeProjection | null;
  displayState: DirectorDisplayState;
  factSummary?: DirectorTaskFactSummary | null;
  chapterProgress?: DirectorChapterExecutionProgressSummary | null;
  activeStep?: DashboardStepLike;
  latestCommand?: DashboardCommandLike;
  workerHealth?: DirectorWorkerHealthSummary | null;
}): DirectorDashboardView {
  const mode = buildMode(input);
  const progress = buildProgress({
    mode,
    task: input.task,
    projection: input.projection,
    chapterProgress: input.chapterProgress ?? null,
    displayState: input.displayState,
  });
  const liveRunning = hasLiveRunningEvidence(input);
  const actions = buildActions(mode);
  const requiresUserAction = mode === "waiting_user";
  return {
    mode,
    statusLabel: statusLabel(mode),
    headline: headlineForMode(mode, input.displayState),
    description: descriptionForMode(mode, input.displayState),
    currentAction: buildCurrentAction({
      mode,
      task: input.task,
      projection: input.projection,
      displayState: input.displayState,
    }),
    progressPercent: progress.percent,
    progressSource: progress.source,
    requiresUserAction,
    userActionReason: requiresUserAction
      ? input.task.checkpointSummary?.trim()
        || input.projection?.blockedReason?.trim()
        || input.projection?.detail?.trim()
        || null
      : null,
    primaryAction: actions.primaryAction,
    secondaryActions: actions.secondaryActions,
    stageKey: input.displayState.stageKey,
    stageLabel: input.displayState.stageLabel,
    stepIndex: input.displayState.stepIndex,
    totalSteps: input.displayState.totalSteps,
    steps: input.displayState.steps,
    diagnostics: buildDiagnostics({
      task: input.task,
      projection: input.projection,
      mode,
      liveRunning,
    }),
    sourceTrace: {
      taskStatus: input.task.status,
      projectionStatus: input.projection?.status ?? null,
      commandStatus: input.latestCommand?.status ?? null,
      activeStepStatus: input.activeStep?.status ?? null,
      checkpointType: input.task.checkpointType ?? null,
      progressSource: progress.source,
    },
  };
}
