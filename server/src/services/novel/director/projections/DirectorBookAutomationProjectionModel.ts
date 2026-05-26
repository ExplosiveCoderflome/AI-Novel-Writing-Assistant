import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationDisplayState,
  DirectorBookAutomationFocusNovel,
  DirectorBookAutomationProjection,
  DirectorBookAutomationStatus,
  DirectorRuntimeProjection,
  DirectorStepRun,
} from "@ai-novel/shared/types/directorRuntime";

export function parseJsonOrNull<T>(value: string | null | undefined): T | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

export function timestampOf(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function commandLabel(commandType: string): string {
  const labels: Record<string, string> = {
    confirm_candidate: "确认开书方向",
    continue: "继续自动导演",
    resume_from_checkpoint: "从进度点恢复",
    retry: "重试自动导演",
    takeover: "接管这本书",
    repair_chapter_titles: "修复章节标题",
    cancel: "取消自动导演",
  };
  return labels[commandType] ?? commandType;
}

export function commandStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "排队中",
    leased: "准备执行",
    running: "执行中",
    succeeded: "完成",
    failed: "失败",
    cancelled: "已取消",
    stale: "需要恢复",
  };
  return labels[status] ?? status;
}

export function workflowStatusToBookStatus(status: string | null | undefined): DirectorBookAutomationStatus {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "waiting_approval") {
    return "waiting_approval";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "succeeded") {
    return "completed";
  }
  return "idle";
}

export function runtimeStatusToBookStatus(status: DirectorRuntimeProjection["status"]): DirectorBookAutomationStatus {
  if (status === "waiting_approval") {
    return "waiting_approval";
  }
  if (status === "blocked") {
    return "blocked";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "completed") {
    return "completed";
  }
  return "idle";
}

export function extractRunMode(seedPayloadJson: string | null | undefined): string | null {
  const seedPayload = parseJsonOrNull<Record<string, unknown>>(seedPayloadJson);
  if (!seedPayload) {
    return null;
  }
  const direct = seedPayload.runMode;
  if (typeof direct === "string") {
    return direct;
  }
  const directorInput = seedPayload.directorInput;
  if (directorInput && typeof directorInput === "object") {
    const value = (directorInput as { runMode?: unknown }).runMode;
    if (typeof value === "string") {
      return value;
    }
  }
  const directorSession = seedPayload.directorSession;
  if (directorSession && typeof directorSession === "object") {
    const value = (directorSession as { runMode?: unknown }).runMode;
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

export function extractCircuitBreaker(
  seedPayloadJson: string | null | undefined,
): DirectorBookAutomationProjection["circuitBreaker"] {
  const seedPayload = parseJsonOrNull<Record<string, unknown>>(seedPayloadJson);
  const autoExecution = seedPayload?.autoExecution;
  if (!autoExecution || typeof autoExecution !== "object") {
    return null;
  }
  const circuitBreaker = (autoExecution as { circuitBreaker?: unknown }).circuitBreaker;
  if (!circuitBreaker || typeof circuitBreaker !== "object") {
    return null;
  }
  const status = (circuitBreaker as { status?: unknown }).status;
  if (status !== "open" && status !== "closed") {
    return null;
  }
  return circuitBreaker as DirectorBookAutomationProjection["circuitBreaker"];
}

export function buildWhereByNovelOrTask(novelId: string, taskIds: string[]) {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
  if (uniqueTaskIds.length === 0) {
    return { novelId };
  }
  return {
    OR: [
      { novelId },
      { taskId: { in: uniqueTaskIds } },
    ],
  };
}

export function buildHeadline(input: {
  status: DirectorBookAutomationStatus;
  runtimeProjection: DirectorRuntimeProjection | null;
  task: {
    currentItemLabel?: string | null;
    checkpointSummary?: string | null;
    lastError?: string | null;
  } | null;
}): string {
  if (input.status === "waiting_recovery") {
    return "等待恢复自动导演";
  }
  if (input.status === "cancelled") {
    return "自动导演已取消";
  }
  if (input.runtimeProjection?.headline?.trim()) {
    return input.runtimeProjection.headline.trim();
  }
  if (input.status === "queued") {
    return "AI 自动导演已排队";
  }
  if (input.status === "running") {
    const label = input.task?.currentItemLabel?.trim();
    return label ? `AI 正在推进：${label}` : "AI 正在推进这本书";
  }
  if (input.status === "waiting_approval") {
    return "等待你的确认";
  }
  if (input.status === "blocked") {
    return "自动导演已暂停";
  }
  if (input.status === "failed") {
    return "自动导演遇到问题";
  }
  if (input.status === "completed") {
    return "自动导演完成最近一次推进";
  }
  return "这本书还没有自动导演记录";
}

function getTaskFailureReason(task: {
  lastError?: string | null;
  checkpointSummary?: string | null;
} | null | undefined): string | null {
  return task?.lastError?.trim() || task?.checkpointSummary?.trim() || null;
}

export function buildDetail(input: {
  status: DirectorBookAutomationStatus;
  runtimeProjection: DirectorRuntimeProjection | null;
  task: {
    checkpointSummary?: string | null;
    lastError?: string | null;
    currentItemLabel?: string | null;
  } | null;
}): string | null {
  if (input.status === "waiting_recovery") {
    return input.task?.lastError?.trim() || "后台执行中断后保留了进度点，确认恢复后会从最近进展继续。";
  }
  if (input.status === "cancelled") {
    return "自动导演任务已取消。";
  }
  if (input.status === "failed") {
    return getTaskFailureReason(input.task)
      || input.runtimeProjection?.blockedReason?.trim()
      || input.runtimeProjection?.detail?.trim()
      || "查看执行详情后可选择恢复或重试。";
  }
  if (input.runtimeProjection?.detail?.trim()) {
    return input.runtimeProjection.detail.trim();
  }
  if (input.task?.checkpointSummary?.trim()) {
    return input.task.checkpointSummary.trim();
  }
  if (input.status === "idle") {
    return "可以从 AI 自动导演开始，让系统根据这本书的资产推荐下一步。";
  }
  return input.task?.currentItemLabel?.trim() ?? null;
}

export function buildAutomationSummary(input: {
  activeCommandCount: number;
  pendingCommandCount: number;
  artifactSummary: DirectorBookAutomationProjection["artifactSummary"];
  autoApprovalRecordCount: number;
  usageSummary?: DirectorBookAutomationProjection["usageSummary"];
}): string {
  const parts: string[] = [];
  if (input.activeCommandCount > 0) {
    parts.push(`${input.activeCommandCount} 个动作执行中`);
  }
  if (input.pendingCommandCount > 0) {
    parts.push(`${input.pendingCommandCount} 个动作排队中`);
  }
  if (input.autoApprovalRecordCount > 0) {
    parts.push(`${input.autoApprovalRecordCount} 个确认由 AI 自动处理`);
  }
  if (input.artifactSummary.activeCount > 0) {
    parts.push(`${input.artifactSummary.activeCount} 个可用产物`);
  }
  if (input.artifactSummary.staleCount > 0) {
    parts.push(`${input.artifactSummary.staleCount} 个产物需复核`);
  }
  if (input.artifactSummary.repairTicketCount > 0) {
    parts.push(`${input.artifactSummary.repairTicketCount} 个修复项`);
  }
  if (input.artifactSummary.protectedUserContentCount > 0) {
    parts.push(`${input.artifactSummary.protectedUserContentCount} 个用户内容受保护`);
  }
  if (input.usageSummary && input.usageSummary.llmCallCount > 0) {
    parts.push(`${input.usageSummary.llmCallCount} 次 AI 调用`);
  }
  if (input.usageSummary && input.usageSummary.totalTokens > 0) {
    parts.push(`${input.usageSummary.totalTokens} Tokens`);
  }
  if ((input.artifactSummary.dependencyCount ?? 0) > 0) {
    parts.push(`${input.artifactSummary.dependencyCount} 条产物依赖`);
  }
  return parts.length > 0 ? parts.join("，") : "暂无自动化动作";
}

function buildNovelHref(
  novelId: string,
  options?: {
    tab?: DirectorBookAutomationAction["target"]["tab"];
    taskId?: string | null;
    taskPanel?: boolean;
  },
): string {
  const params = new URLSearchParams();
  if (options?.tab) {
    params.set("stage", options.tab);
  }
  if (options?.taskId) {
    params.set("directorTaskId", options.taskId);
  }
  if (options?.taskPanel) {
    params.set("taskPanel", "1");
  }
  const query = params.toString();
  return `/novels/${novelId}/edit${query ? `?${query}` : ""}`;
}

function buildCandidateSelectionHref(taskId: string): string {
  const params = new URLSearchParams();
  params.set("workflowTaskId", taskId);
  params.set("mode", "director");
  return `/novels/create?${params.toString()}`;
}

export function buildFocusNovel(input: { id: string; title?: string | null }): DirectorBookAutomationFocusNovel {
  const title = input.title?.trim() || "未命名小说";
  return {
    id: input.id,
    title,
    href: buildNovelHref(input.id),
  };
}

export function buildDisplayState(status: DirectorBookAutomationStatus): DirectorBookAutomationDisplayState {
  if (status === "queued" || status === "running") {
    return "processing";
  }
  if (status === "waiting_approval") {
    return "needs_confirmation";
  }
  if (status === "waiting_recovery" || status === "blocked" || status === "cancelled") {
    return "paused";
  }
  if (status === "failed") {
    return "needs_attention";
  }
  if (status === "completed") {
    return "completed";
  }
  return "idle";
}

export function buildUserHeadline(input: {
  status: DirectorBookAutomationStatus;
  task?: {
    currentItemLabel?: string | null;
    checkpointType?: string | null;
  } | null;
}): string {
  if (input.status === "queued") {
    return "AI 已接到这本书的推进任务";
  }
  if (input.status === "running") {
    const label = input.task?.currentItemLabel?.trim();
    return label ? `AI 正在处理：${label}` : "AI 正在推进这本书";
  }
  if (input.status === "waiting_approval") {
    return "等你确认后继续";
  }
  if (input.status === "waiting_recovery" || input.status === "blocked") {
    return "AI 已暂停在可处理的位置";
  }
  if (input.status === "failed") {
    return "AI 推进遇到问题";
  }
  if (input.status === "cancelled") {
    return "这次自动推进已停止";
  }
  if (input.status === "completed") {
    return "AI 完成了最近一次推进";
  }
  return "这本书还没有开启 AI 自动推进";
}

export function buildUserReason(input: {
  status: DirectorBookAutomationStatus;
  runtimeProjection: DirectorRuntimeProjection | null;
  task: {
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    lastError?: string | null;
    currentItemLabel?: string | null;
  } | null;
  blockedReason?: string | null;
  detail?: string | null;
}): string | null {
  const directReason = input.status === "failed"
    ? (
      getTaskFailureReason(input.task)
      || input.blockedReason?.trim()
      || input.detail?.trim()
      || input.runtimeProjection?.blockedReason?.trim()
      || input.runtimeProjection?.detail?.trim()
    )
    : (
      input.blockedReason?.trim()
      || input.detail?.trim()
      || input.runtimeProjection?.blockedReason?.trim()
      || input.runtimeProjection?.detail?.trim()
      || input.task?.checkpointSummary?.trim()
      || input.task?.lastError?.trim()
    );
  if (directReason) {
    return directReason;
  }
  if (input.status === "queued") {
    return "任务已进入后台队列，你可以离开当前页面。";
  }
  if (input.status === "running") {
    return input.task?.currentItemLabel?.trim() || "AI 正在按当前计划推进小说。";
  }
  if (input.status === "waiting_approval") {
    return "继续前需要你确认当前阶段的结果或影响范围。";
  }
  if (input.status === "waiting_recovery") {
    return "系统保留了最近进度，确认后可以从当前位置继续。";
  }
  if (input.status === "blocked") {
    return "继续前需要先处理当前阻塞原因。";
  }
  if (input.status === "failed") {
    return "查看原因后可以重试或回到小说页面处理。";
  }
  if (input.status === "completed") {
    return "可以进入小说页面查看成果或继续下一段写作。";
  }
  return "可以继续手动创作，也可以让 AI 接管后续推进。";
}

function action(input: DirectorBookAutomationAction): DirectorBookAutomationAction {
  return input;
}

export function buildPrimaryAction(input: {
  novelId: string;
  status: DirectorBookAutomationStatus;
  task: {
    id: string;
    checkpointType?: string | null;
  } | null;
}): DirectorBookAutomationAction | null {
  const taskId = input.task?.id ?? null;
  if (!taskId) {
    return action({
      type: "open_novel",
      label: "打开小说",
      target: { novelId: input.novelId, href: buildNovelHref(input.novelId) },
      emphasis: "primary",
    });
  }

  if (input.status === "waiting_approval") {
    if (input.task?.checkpointType === "candidate_selection_required") {
      return action({
        type: "confirm_candidate",
        label: "确认书级方向",
        target: { novelId: input.novelId, taskId, href: buildCandidateSelectionHref(taskId) },
        emphasis: "primary",
      });
    }
    if (input.task?.checkpointType === "chapter_batch_ready") {
      return action({
        type: "auto_execute_range",
        label: "继续自动执行章节",
        target: {
          novelId: input.novelId,
          taskId,
          tab: "chapter",
          href: buildNovelHref(input.novelId, { tab: "chapter", taskId }),
        },
        commandPayload: { taskId, continuationMode: "auto_execute_range" },
        emphasis: "primary",
      });
    }
    if (input.task?.checkpointType === "replan_required") {
      return action({
        type: "open_quality_repair",
        label: "打开质量修复",
        target: {
          novelId: input.novelId,
          taskId,
          tab: "pipeline",
          href: buildNovelHref(input.novelId, { tab: "pipeline", taskId }),
        },
        emphasis: "primary",
      });
    }
    return action({
      type: "continue",
      label: "确认并继续",
      target: { novelId: input.novelId, taskId, href: buildNovelHref(input.novelId, { taskId }) },
      commandPayload: { taskId, continuationMode: "resume" },
      emphasis: "primary",
    });
  }

  if (input.status === "waiting_recovery") {
    return action({
      type: "continue",
      label: "从进度点继续",
      target: { novelId: input.novelId, taskId, href: buildNovelHref(input.novelId, { taskId }) },
      commandPayload: { taskId, continuationMode: "resume" },
      emphasis: "primary",
    });
  }

  if (input.status === "failed" || input.status === "blocked") {
    return action({
      type: "open_details",
      label: input.status === "failed" ? "查看失败原因" : "查看暂停原因",
      target: { novelId: input.novelId, taskId, href: buildNovelHref(input.novelId, { taskId, taskPanel: true }) },
      emphasis: "primary",
    });
  }

  if (input.status === "queued" || input.status === "running") {
    return action({
      type: "open_novel",
      label: "查看推进状态",
      target: { novelId: input.novelId, taskId, href: buildNovelHref(input.novelId, { taskId }) },
      emphasis: "primary",
    });
  }

  if (input.status === "completed") {
    return action({
      type: "open_chapter",
      label: "进入章节执行",
      target: {
        novelId: input.novelId,
        taskId,
        tab: "chapter",
        href: buildNovelHref(input.novelId, { tab: "chapter", taskId }),
      },
      emphasis: "primary",
    });
  }

  return action({
    type: "open_novel",
    label: "打开小说",
    target: { novelId: input.novelId, taskId, href: buildNovelHref(input.novelId, { taskId }) },
    emphasis: "primary",
  });
}

export function buildSecondaryActions(input: {
  novelId: string;
  status: DirectorBookAutomationStatus;
  taskId?: string | null;
}): DirectorBookAutomationAction[] {
  if (!input.taskId) {
    return [];
  }
  const actions: DirectorBookAutomationAction[] = [
    action({
      type: "open_details",
      label: "执行详情",
      target: {
        novelId: input.novelId,
        taskId: input.taskId,
        href: buildNovelHref(input.novelId, { taskId: input.taskId, taskPanel: true }),
      },
      emphasis: "secondary",
    }),
  ];
  if (input.status === "queued" || input.status === "running" || input.status === "waiting_approval") {
    actions.push(action({
      type: "cancel",
      label: "暂停推进",
      target: { novelId: input.novelId, taskId: input.taskId },
      emphasis: "secondary",
    }));
  }
  if (input.status === "failed" || input.status === "cancelled") {
    actions.push(action({
      type: "retry",
      label: "重试",
      target: { novelId: input.novelId, taskId: input.taskId },
      emphasis: "secondary",
    }));
  }
  return actions;
}

export function mapStepForUsage(step: {
  idempotencyKey: string;
  nodeKey: string;
  label: string;
  status: string;
  targetType?: string | null;
  targetId?: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}): DirectorStepRun {
  return {
    idempotencyKey: step.idempotencyKey,
    nodeKey: step.nodeKey,
    label: step.label,
    status: step.status as DirectorStepRun["status"],
    targetType: step.targetType as DirectorStepRun["targetType"],
    targetId: step.targetId,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
    error: step.error,
  };
}
