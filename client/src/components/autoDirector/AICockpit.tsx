import type { ReactNode } from "react";
import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationDisplayState,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import { getDirectorNodeDisplayLabel } from "@ai-novel/shared/types/directorRuntime";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  History,
  PauseCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AICockpitProps {
  projection?: DirectorBookAutomationProjection | null;
  mode?: "focusedNovel" | "compact";
  fallbackSummary?: string | null;
  fallbackStatusLabel?: string | null;
  isActionPending?: boolean;
  showDetailsAction?: boolean;
  onAction?: (projection: DirectorBookAutomationProjection, action: DirectorBookAutomationAction) => void;
  onOpenDetails?: (projection: DirectorBookAutomationProjection) => void;
  onOpenNovel?: (projection: DirectorBookAutomationProjection) => void;
  onOpenFallbackDetails?: () => void;
}

function displayStateLabel(state: DirectorBookAutomationDisplayState): string {
  const labels: Record<DirectorBookAutomationDisplayState, string> = {
    processing: "AI 正在处理",
    needs_confirmation: "等你确认",
    paused: "已暂停",
    needs_attention: "出错需处理",
    completed: "已完成",
    idle: "未开启",
  };
  return labels[state];
}

function stateBadgeVariant(state: DirectorBookAutomationDisplayState): "default" | "secondary" | "outline" | "destructive" {
  if (state === "needs_attention") {
    return "destructive";
  }
  if (state === "processing") {
    return "default";
  }
  if (state === "needs_confirmation" || state === "paused") {
    return "outline";
  }
  return "secondary";
}

function stateClassName(state: DirectorBookAutomationDisplayState): string {
  if (state === "processing") {
    return "border-sky-200 bg-sky-50/70";
  }
  if (state === "needs_confirmation") {
    return "border-amber-200 bg-amber-50/70";
  }
  if (state === "paused") {
    return "border-indigo-200 bg-indigo-50/60";
  }
  if (state === "needs_attention") {
    return "border-destructive/30 bg-destructive/5";
  }
  if (state === "completed") {
    return "border-emerald-200 bg-emerald-50/60";
  }
  return "border-border/70 bg-muted/20";
}

function stateIcon(state: DirectorBookAutomationDisplayState) {
  if (state === "processing") {
    return <Activity className="h-4 w-4" />;
  }
  if (state === "needs_confirmation") {
    return <PauseCircle className="h-4 w-4" />;
  }
  if (state === "paused") {
    return <Clock3 className="h-4 w-4" />;
  }
  if (state === "needs_attention") {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (state === "completed") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  return <ShieldCheck className="h-4 w-4" />;
}

function stateAccentClassName(state: DirectorBookAutomationDisplayState): string {
  if (state === "processing") {
    return "text-sky-700";
  }
  if (state === "needs_confirmation") {
    return "text-amber-700";
  }
  if (state === "paused") {
    return "text-indigo-700";
  }
  if (state === "needs_attention") {
    return "text-destructive";
  }
  if (state === "completed") {
    return "text-emerald-700";
  }
  return "text-muted-foreground";
}

function stateSoftSurfaceClassName(state: DirectorBookAutomationDisplayState): string {
  if (state === "processing") {
    return "bg-sky-50/60";
  }
  if (state === "needs_confirmation") {
    return "bg-amber-50/70";
  }
  if (state === "paused") {
    return "bg-indigo-50/60";
  }
  if (state === "needs_attention") {
    return "bg-destructive/5";
  }
  if (state === "completed") {
    return "bg-emerald-50/60";
  }
  return "bg-muted/20";
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

function formatTokenCount(value: number | null | undefined): string {
  const count = Math.max(0, Math.round(Number(value ?? 0)));
  return count.toLocaleString();
}

function formatDuration(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const seconds = Math.round(value / 1000);
  if (seconds <= 0) {
    return "<1 秒";
  }
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
}

function formatUsageLine(usage: {
  llmCallCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
}): string {
  const duration = formatDuration(usage.durationMs);
  return [
    `${formatTokenCount(usage.llmCallCount)} 次调用`,
    `输入 ${formatTokenCount(usage.promptTokens)}`,
    `输出 ${formatTokenCount(usage.completionTokens)}`,
    `总计 ${formatTokenCount(usage.totalTokens)} Tokens`,
    duration ? `累计调用耗时 ${duration}` : null,
  ].filter(Boolean).join(" · ");
}

function fallbackProjectionReason(props: Pick<AICockpitProps, "fallbackSummary">): string {
  return props.fallbackSummary?.trim() || "没有需要你处理的 AI 自动推进任务。";
}

function renderActionLabel(
  action: DirectorBookAutomationAction,
  displayState?: DirectorBookAutomationDisplayState,
): string {
  if (
    displayState === "needs_confirmation"
    && (action.type === "continue" || action.type === "auto_execute_range")
  ) {
    return "确认并继续";
  }
  return action.label || "继续处理";
}

function artifactTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    book_contract: "书级约定",
    story_macro: "故事规划",
    character_cast: "角色",
    volume_strategy: "分卷",
    chapter_task_sheet: "任务单",
    chapter_draft: "正文",
    audit_report: "审校",
    repair_ticket: "修复",
    reader_promise: "读者承诺",
    character_governance_state: "角色状态",
    world_skeleton: "世界框架",
    source_knowledge_pack: "资料包",
    chapter_retention_contract: "留存约定",
    continuity_state: "连续性",
    rolling_window_review: "近期复盘",
  };
  return labels[type] ?? type;
}

function recoveryActionLabel(
  action: NonNullable<DirectorBookAutomationProjection["circuitBreaker"]>["recoveryAction"],
): string | null {
  const labels: Record<string, string> = {
    retry: "重试当前步骤",
    resume_after_review: "查看原因后继续",
    switch_model: "切换模型后继续",
    confirm_protected_content: "确认保护内容边界",
    manual_repair: "先处理章节问题",
  };
  return action ? labels[action] ?? null : null;
}

function workerStateLabel(
  state: NonNullable<DirectorBookAutomationProjection["workerHealth"]>["derivedState"],
): string {
  const labels: Record<NonNullable<DirectorBookAutomationProjection["workerHealth"]>["derivedState"], string> = {
    idle: "未运行",
    queued_waiting_worker: "等待接手",
    leased_starting: "正在接手",
    running_step: "自动推进中",
    waiting_gate: "等待确认",
    auto_recovering: "恢复中",
    cancelled: "已停止",
    failed_recoverable: "等待恢复",
    failed_hard: "需要处理",
    succeeded: "已完成",
  };
  return labels[state] ?? state;
}

function workerStateDetail(health: NonNullable<DirectorBookAutomationProjection["workerHealth"]>): string {
  if (health.message?.trim()) {
    return health.message.trim();
  }
  if (health.queuedCommandCount > 0) {
    return "任务已排队，后台执行接手后会继续推进。";
  }
  if (health.runningCommandCount > 0 || health.leasedCommandCount > 0) {
    return "后台执行正在处理当前任务。";
  }
  if (health.staleCommandCount > 0) {
    return "后台执行中断后会从最近进度尝试恢复。";
  }
  return "当前没有正在排队或执行的后台动作。";
}

function SummaryMetric(props: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className={cn("mt-1 truncate text-sm font-medium text-foreground", props.className)}>
        {props.value}
      </div>
    </div>
  );
}

function DetailPanel(props: {
  title: string;
  summary?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl bg-muted/25">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          {props.icon ? <span className="shrink-0 text-muted-foreground">{props.icon}</span> : null}
          <span className="truncate">{props.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
          {props.summary}
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1">
        {props.children}
      </div>
    </details>
  );
}

export default function AICockpit(props: AICockpitProps) {
  const {
    mode = "focusedNovel",
    fallbackStatusLabel,
    isActionPending = false,
    showDetailsAction = true,
    onAction,
    onOpenDetails,
    onOpenNovel,
    onOpenFallbackDetails,
  } = props;
  const focusProjection = props.projection ?? null;
  const isCompact = mode === "compact";

  if (!focusProjection) {
    return (
      <div className="rounded-2xl bg-muted/25 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-muted-foreground">{stateIcon("idle")}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">AI 驾驶舱</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{fallbackProjectionReason(props)}</div>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">{fallbackStatusLabel ?? "未开启"}</Badge>
        </div>
        {onOpenFallbackDetails ? (
          <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={onOpenFallbackDetails}>
            查看
          </Button>
        ) : null}
      </div>
    );
  }

  const primaryAction = focusProjection.primaryAction ?? null;
  const detailAction = focusProjection.secondaryActions?.find((item) => item.type === "open_details") ?? null;
  const canOpenDetails = showDetailsAction && Boolean(onOpenDetails || (detailAction && onAction));
  const recentItems = focusProjection.timeline.slice(0, isCompact ? 2 : 3);
  const artifactRows = focusProjection.artifactSummary.byType?.slice(0, 3) ?? [];
  const usageSummary = focusProjection.usageSummary ?? null;
  const stepUsage = focusProjection.stepUsage?.slice(0, 2) ?? [];
  const promptUsage = focusProjection.promptUsage?.slice(0, 6) ?? [];
  const circuitBreaker = focusProjection.circuitBreaker?.status === "open" ? focusProjection.circuitBreaker : null;
  const circuitRecovery = recoveryActionLabel(circuitBreaker?.recoveryAction ?? null);
  const workerHealth = focusProjection.workerHealth ?? null;
  const artifactInsightLines = [
    focusProjection.artifactSummary.affectedChapterCount
      ? `影响 ${focusProjection.artifactSummary.affectedChapterCount} 个章节`
      : null,
    focusProjection.artifactSummary.recentStaleArtifacts?.length
      ? `${focusProjection.artifactSummary.recentStaleArtifacts.length} 个产物需复核`
      : null,
    focusProjection.artifactSummary.recentRepairArtifacts?.length
      ? `${focusProjection.artifactSummary.recentRepairArtifacts.length} 条修复记录`
      : null,
    focusProjection.artifactSummary.recentVersionedArtifacts?.length
      ? `${focusProjection.artifactSummary.recentVersionedArtifacts.length} 个产物有新版本`
      : null,
  ].filter((line): line is string => Boolean(line));
  const reason = focusProjection.userReason?.trim()
    || focusProjection.blockedReason?.trim()
    || focusProjection.detail?.trim()
    || focusProjection.automationSummary?.trim()
    || fallbackProjectionReason(props);
  const statusHeadline = focusProjection.userHeadline?.trim()
    || focusProjection.headline?.trim()
    || displayStateLabel(focusProjection.displayState);
  const statusDetail = reason === statusHeadline
    ? focusProjection.progressSummary?.trim() || "AI 会在这里汇总本书自动推进的最新状态。"
    : reason;
  const latestRecordText = recentItems[0] ? formatDate(recentItems[0].occurredAt) : "暂无";

  const handlePrimaryAction = () => {
    if (primaryAction && onAction) {
      onAction(focusProjection, primaryAction);
      return;
    }
    onOpenNovel?.(focusProjection);
  };

  const handleDetails = () => {
    if (detailAction && onAction) {
      onAction(focusProjection, detailAction);
      return;
    }
    onOpenDetails?.(focusProjection);
  };

  const handleCompactOpen = () => {
    if (onOpenNovel) {
      onOpenNovel(focusProjection);
      return;
    }
    handleDetails();
  };

  if (isCompact) {
    return (
      <div className={cn("rounded-lg border p-3", stateClassName(focusProjection.displayState))}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-foreground">{stateIcon(focusProjection.displayState)}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">AI 驾驶舱</div>
              <div className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                {focusProjection.userHeadline || focusProjection.headline || reason}
              </div>
            </div>
          </div>
          <Badge variant={stateBadgeVariant(focusProjection.displayState)} className="shrink-0">
            {displayStateLabel(focusProjection.displayState)}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={handleCompactOpen}>
          查看
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={cn("rounded-2xl p-5 shadow-sm", stateSoftSurfaceClassName(focusProjection.displayState))}>
        <div className="flex items-center justify-between gap-3">
          <div className={cn("flex min-w-0 items-center gap-2 text-xs font-medium", stateAccentClassName(focusProjection.displayState))}>
            <span className="shrink-0">
              {stateIcon(focusProjection.displayState)}
            </span>
            <span className="truncate">{displayStateLabel(focusProjection.displayState)}</span>
          </div>
          <span className="min-w-0 max-w-[52%] truncate rounded-full bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
            {focusProjection.focusNovel.title}
          </span>
        </div>

        <div className="mt-4 max-w-[46rem]">
          <h3 className="text-base font-semibold leading-7 text-foreground">{statusHeadline}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{statusDetail}</p>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-background/60 p-3 sm:grid-cols-3">
          <SummaryMetric
            label="当前状态"
            value={displayStateLabel(focusProjection.displayState)}
            className={stateAccentClassName(focusProjection.displayState)}
          />
          <SummaryMetric label="推进概览" value={focusProjection.progressSummary || "暂无进度摘要"} />
          <SummaryMetric label="最近记录" value={latestRecordText} />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">下一步</div>
            <div className="mt-1 text-sm font-medium leading-5 text-foreground">
              {focusProjection.nextActionLabel || "打开小说查看当前内容"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button type="button" size="sm" onClick={handlePrimaryAction} disabled={isActionPending}>
              {isActionPending ? "处理中..." : renderActionLabel(primaryAction ?? {
                type: "open_novel",
                label: "打开小说",
                target: { novelId: focusProjection.novelId },
              }, focusProjection.displayState)}
            </Button>
            {canOpenDetails ? (
              <Button type="button" size="sm" variant="secondary" onClick={handleDetails}>
                <ExternalLink className="h-4 w-4" />
                执行详情
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {circuitBreaker ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive">
          <div className="font-medium">自动推进已暂停</div>
          <div className="mt-1">{circuitBreaker.message || "系统检测到继续自动推进可能反复失败。"}</div>
          {circuitRecovery ? <div className="mt-1">建议：{circuitRecovery}。</div> : null}
        </section>
      ) : null}

      {workerHealth ? (
        <section className="rounded-2xl bg-muted/25 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              后台执行
            </div>
            <span className="text-xs text-muted-foreground">{workerStateLabel(workerHealth.derivedState)}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{workerStateDetail(workerHealth)}</div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <SummaryMetric label="排队" value={workerHealth.queuedCommandCount} />
            <SummaryMetric label="接手" value={workerHealth.leasedCommandCount} />
            <SummaryMetric label="执行" value={workerHealth.runningCommandCount} />
            <SummaryMetric label="恢复" value={workerHealth.staleCommandCount} />
          </div>
          {workerHealth.oldestQueuedWaitMs ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              等待接手 {formatDuration(workerHealth.oldestQueuedWaitMs) ?? "<1 秒"}
            </div>
          ) : null}
        </section>
      ) : null}

      {artifactRows.length > 0 ? (
        <section className="rounded-2xl bg-muted/25 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              产物记录
            </div>
            {artifactInsightLines.length > 0 ? (
              <span className="text-xs text-muted-foreground">{artifactInsightLines[0]}</span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {artifactRows.map((item) => (
              <span key={item.artifactType}>
                <span className="font-medium text-foreground">{artifactTypeLabel(String(item.artifactType))}</span>
                <span className="ml-1">{item.activeCount}/{item.totalCount}</span>
              </span>
            ))}
          </div>
          {artifactInsightLines.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {artifactInsightLines.slice(1).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {usageSummary ? (
        <DetailPanel
          title="AI 用量"
          summary={`${formatTokenCount(usageSummary.llmCallCount)} 次 · ${formatTokenCount(usageSummary.totalTokens)} Tokens`}
          icon={<Activity className="h-4 w-4" />}
        >
          <div className="space-y-3 text-xs leading-5 text-muted-foreground">
            <div>{formatUsageLine(usageSummary)}</div>
            {promptUsage.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-foreground">阶段用量</div>
                <div className="divide-y divide-border/60">
                  {promptUsage.map((item) => (
                    <div key={`${item.promptAssetKey}:${item.promptVersion ?? ""}:${item.nodeKey ?? ""}`} className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <span className="min-w-0 truncate text-foreground">
                        {getDirectorNodeDisplayLabel({ label: item.label ?? item.promptAssetKey, nodeKey: item.nodeKey })}
                      </span>
                      <span>{formatUsageLine(item)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {stepUsage.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-foreground">推进步骤</div>
                <div className="divide-y divide-border/60">
                  {stepUsage.map((item) => (
                    <div key={item.stepIdempotencyKey} className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <span className="min-w-0 truncate text-foreground">
                        {getDirectorNodeDisplayLabel({ label: item.label, nodeKey: item.nodeKey })}
                      </span>
                      <span>{formatUsageLine(item)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DetailPanel>
      ) : null}

      {recentItems.length > 0 ? (
        <DetailPanel
          title="自动化记录"
          summary={`${recentItems.length} 条`}
          icon={<History className="h-4 w-4" />}
        >
          <div className="divide-y divide-border/60 text-xs leading-5">
            {recentItems.map((item) => (
              <div key={item.id} className="py-2">
                <div className="line-clamp-2 text-foreground">{item.title}</div>
                {item.usage ? (
                  <div className="mt-1 text-muted-foreground">{formatUsageLine(item.usage)}</div>
                ) : item.durationMs ? (
                  <div className="mt-1 text-muted-foreground">耗时 {formatDuration(item.durationMs)}</div>
                ) : null}
                <div className="mt-1 text-muted-foreground">{formatDate(item.occurredAt)}</div>
              </div>
            ))}
          </div>
        </DetailPanel>
      ) : null}
    </div>
  );
}
