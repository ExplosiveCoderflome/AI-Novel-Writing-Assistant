import i18next from "i18next";
import type {
  DirectorPolicyMode,
  DirectorRuntimeProjection,
  DirectorRuntimeProjectionStatus,
} from "@ai-novel/shared/types/directorRuntime";
import { getDirectorNodeDisplayLabel } from "@ai-novel/shared/types/directorRuntime";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DirectorRuntimeProjectionCardProps {
  projection: DirectorRuntimeProjection | null | undefined;
  className?: string;
  compact?: boolean;
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) {
    return locale === "en" ? "N/A" : "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "en" ? "N/A" : "暂无";
  }
  return date.toLocaleString(locale === "en" ? "en-US" : "zh-CN");
}

function formatTokenCount(value: number | null | undefined): string {
  const count = Math.max(0, Math.round(Number(value ?? 0)));
  return count.toLocaleString();
}

function formatDuration(value: number | null | undefined, isEn: boolean): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const seconds = Math.round(value / 1000);
  if (seconds <= 0) {
    return isEn ? "<1 sec" : "<1 秒";
  }
  if (seconds < 60) {
    return isEn ? `${seconds} sec` : `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (isEn) {
    return restSeconds > 0 ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  }
  return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
}

function formatUsageLine(
  usage: {
    llmCallCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs?: number | null;
  },
  isEn: boolean
): string {
  const duration = formatDuration(usage.durationMs, isEn);
  if (isEn) {
    return [
      `${formatTokenCount(usage.llmCallCount)} calls`,
      `In ${formatTokenCount(usage.promptTokens)}`,
      `Out ${formatTokenCount(usage.completionTokens)}`,
      `Total ${formatTokenCount(usage.totalTokens)} Tokens`,
      duration ? `Duration ${duration}` : null,
    ].filter(Boolean).join(" · ");
  }
  return [
    `${formatTokenCount(usage.llmCallCount)} 次调用`,
    `输入 ${formatTokenCount(usage.promptTokens)}`,
    `输出 ${formatTokenCount(usage.completionTokens)}`,
    `总计 ${formatTokenCount(usage.totalTokens)} Tokens`,
    duration ? `累计调用耗时 ${duration}` : null,
  ].filter(Boolean).join(" · ");
}

function formatPolicyMode(mode: DirectorPolicyMode, isEn: boolean): string {
  if (mode === "suggest_only") {
    return isEn ? "Suggest Only" : "只给建议";
  }
  if (mode === "run_next_step") {
    return isEn ? "Run Next Step" : "推进下一步";
  }
  if (mode === "auto_safe_scope") {
    return isEn ? "Auto Safe Scope" : "安全范围自动推进";
  }
  return isEn ? "Run to Checkpoint" : "推进到检查点";
}

function formatStatus(status: DirectorRuntimeProjectionStatus, isEn: boolean): string {
  if (status === "running") {
    return isEn ? "Running" : "推进中";
  }
  if (status === "waiting_approval") {
    return isEn ? "Waiting Confirmation" : "等待确认";
  }
  if (status === "blocked") {
    return isEn ? "Paused" : "已暂停";
  }
  if (status === "failed") {
    return isEn ? "Failed" : "失败";
  }
  if (status === "completed") {
    return isEn ? "Completed" : "已完成";
  }
  return isEn ? "Pending" : "待开始";
}

function statusClassName(status: DirectorRuntimeProjectionStatus): string {
  if (status === "running") {
    return "border-sky-300 bg-sky-50 text-sky-900";
  }
  if (status === "waiting_approval") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  if (status === "blocked" || status === "failed") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (status === "completed") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function statusIcon(status: DirectorRuntimeProjectionStatus) {
  if (status === "running") {
    return <Activity className="h-4 w-4" />;
  }
  if (status === "waiting_approval") {
    return <PauseCircle className="h-4 w-4" />;
  }
  if (status === "blocked") {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  return <ShieldCheck className="h-4 w-4" />;
}

function riskBadgeClassName(level: NonNullable<DirectorRuntimeProjection["visibleRiskBadges"]>[number]["level"]) {
  if (level === "danger") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (level === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function formatQualityDebtSummary(summary: DirectorRuntimeProjection["qualityDebtSummary"] | null | undefined, isEn: boolean): string | null {
  if (!summary || summary.deferredChapterCount <= 0) {
    return null;
  }
  if (isEn) {
    const orderText = summary.deferredChapterOrders.length > 0
      ? `: Ch. ${summary.deferredChapterOrders.join(", ")}`
      : "";
    return `Quality debt pending recovery${orderText}. System will continue writing subsequent chapters and recover these issues during repair phase.`;
  }
  const orderText = summary.deferredChapterOrders.length > 0
    ? `：第 ${summary.deferredChapterOrders.join("、")} 章`
    : "";
  return `质量待回收${orderText}。系统会先继续写后续章节，并在质量修复阶段回收这些问题。`;
}

function formatQualityBudgetSummary(summary: DirectorRuntimeProjection["qualityBudgetSummary"] | null | undefined, isEn: boolean): string | null {
  if (!summary) {
    return null;
  }
  if (isEn) {
    const chapterText = typeof summary.currentChapterOrder === "number"
      ? `Ch. ${summary.currentChapterOrder}`
      : "Current Chapter";
    return `${chapterText} Quality Budget: Local Repair ${summary.patchRepairUsed}/1, Rewrite Chapter ${summary.chapterRewriteUsed}/1, Window Replan ${summary.windowReplanUsed}/1. ${summary.nextActionLabel}`;
  }
  const chapterText = typeof summary.currentChapterOrder === "number"
    ? `第 ${summary.currentChapterOrder} 章`
    : "当前章节";
  return `${chapterText}质量预算：局部修复 ${summary.patchRepairUsed}/1，整章重写 ${summary.chapterRewriteUsed}/1，窗口重规划 ${summary.windowReplanUsed}/1。${summary.nextActionLabel}`;
}

function formatRootCauseSummary(projection: DirectorRuntimeProjection, isEn: boolean): string | null {
  if (!projection.rootCauseCode || projection.rootCauseCode === "none") {
    return null;
  }
  if (isEn) {
    if (projection.rootCauseCode === "replan_required") {
      return "Current issue stems from chapter responsibility mismatch. System needs to adjust nearby chapter plans first.";
    }
    if (projection.rootCauseCode === "draft_obligation_unmet") {
      return "Draft generated, but required obligations for this chapter remain unmet.";
    }
    if (projection.rootCauseCode === "draft_repair_exhausted") {
      return "Draft generated, but blocking issues remain after auto-repair.";
    }
    return "Draft generation failed. Current chapter needs to be re-executed.";
  }
  if (projection.rootCauseCode === "replan_required") {
    return "当前问题来自章节职责失配，系统需要先调整附近章节安排。";
  }
  if (projection.rootCauseCode === "draft_obligation_unmet") {
    return "正文已经生成，但仍有本章必须完成的内容没有兑现。";
  }
  if (projection.rootCauseCode === "draft_repair_exhausted") {
    return "正文已经生成，但自动修复后仍有阻塞问题需要继续处理。";
  }
  return "正文没有成功生成，需要重新执行当前章节。";
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export default function DirectorRuntimeProjectionCard({
  projection,
  className,
  compact = false,
}: DirectorRuntimeProjectionCardProps) {
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");

  if (!projection) {
    return null;
  }
  const primaryText = projection.headline?.trim()
    || projection.currentLabel?.trim()
    || projection.lastEventSummary?.trim()
    || (isEn ? "Waiting to sync current progress state" : "等待同步当前推进状态");
  const detailText = projection.detail?.trim();
  const attentionText = projection.requiresUserAction
    ? projection.blockingReason?.trim()
      || projection.blockedReason?.trim()
      || projection.lastEventSummary?.trim()
      || (isEn ? "Please handle the current checkpoint first." : "请先处理当前停留点。")
    : projection.blockingReason?.trim() || projection.blockedReason?.trim();
  const progressLine = projection.progressBreakdown?.explanation?.trim()
    || projection.progressSummary?.trim()
    || null;
  const qualityDebtLine = formatQualityDebtSummary(projection.qualityDebtSummary, isEn);
  const qualityBudgetLine = formatQualityBudgetSummary(projection.qualityBudgetSummary, isEn);
  const rootCauseLine = formatRootCauseSummary(projection, isEn);
  const obligationLine = projection.blockingObligations && projection.blockingObligations.length > 0
    ? `${isEn ? "Pending Obligations: " : "仍需处理："}${projection.blockingObligations.slice(0, 3).map((item) => item.summary).join("；")}`
    : null;
  const activeExecutionLine = projection.activeExecution
    ? `${isEn ? "Background Exec: " : "后台执行："}${getDirectorNodeDisplayLabel({
      nodeKey: projection.activeExecution.stepType,
      fallback: projection.currentAction || (isEn ? "Director Task" : "自动导演任务"),
    })}${projection.activeExecution.resourceClass ? ` · ${projection.activeExecution.resourceClass}` : ""}`
    : null;
  const waitingLine = projection.waitingReason ? `${isEn ? "Waiting Reason: " : "等待原因："}${projection.waitingReason}` : null;
  const workerHealthLine = projection.workerHealth
    ? [
      `${isEn ? "Queue: " : "执行队列："}${projection.workerHealth.queuedCommandCount} ${isEn ? "queued" : "个等待"}`,
      projection.workerHealth.runningCommandCount > 0 ? `${projection.workerHealth.runningCommandCount} ${isEn ? "running" : "个处理中"}` : null,
      projection.workerHealth.currentWorkerId ? `${isEn ? "Worker: " : "执行器："}${projection.workerHealth.currentWorkerId}` : null,
    ].filter(Boolean).join(" · ")
    : null;
  const helperLines = [
    activeExecutionLine,
    waitingLine,
    workerHealthLine,
    projection.nextActionLabel ? `${isEn ? "Next: " : "下一步："}${projection.nextActionLabel}` : null,
    projection.recommendedAction?.reason ? `${isEn ? "Recommended Reason: " : "推荐原因："}${projection.recommendedAction.reason}` : null,
    projection.isAutopilotRecoverable ? (isEn ? "AI can resume from current progress." : "AI 可以从当前进度继续处理。") : null,
    rootCauseLine,
    obligationLine,
    qualityBudgetLine,
    qualityDebtLine,
    projection.scopeSummary,
    progressLine,
  ].filter((line): line is string => Boolean(line?.trim()));
  const recentEvents = projection.recentEvents.slice(0, compact ? 2 : 4);
  const usageSummary = projection.usageSummary ?? null;
  const stepUsage = projection.stepUsage?.slice(0, compact ? 2 : 4) ?? [];
  const promptUsage = projection.promptUsage?.slice(0, compact ? 2 : 6) ?? [];
  const visibleRiskBadges = projection.visibleRiskBadges?.slice(0, compact ? 3 : 6) ?? [];
  const progressBreakdown = projection.progressBreakdown ?? null;

  return (
    <div className={cn("rounded-lg border bg-background/80 p-3", statusClassName(projection.status), className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0">{statusIcon(projection.status)}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{isEn ? "Director Progress" : "导演进度"}</div>
            <div className="mt-1 text-sm leading-5">{primaryText}</div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 bg-background/70">
          {formatStatus(projection.status, isEn)}
        </Badge>
      </div>

      {visibleRiskBadges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleRiskBadges.map((badge) => (
            <Badge key={`${badge.source ?? "risk"}:${badge.label}`} variant="outline" className={cn("bg-background/70", riskBadgeClassName(badge.level))}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ) : null}

      {progressBreakdown && !compact ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isEn ? "Planning" : "规划"}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.planningProgress ?? progressBreakdown.planningPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isEn ? "Chapters" : "章节"}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{progressBreakdown.continuableChapters}/{progressBreakdown.totalChapters}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isEn ? "Quality" : "质量"}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.qualityProgress ?? progressBreakdown.qualityRepairPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isEn ? "Active Action" : "当前动作"}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.activeJobProgress)}</div>
          </div>
        </div>
      ) : null}

      {attentionText ? (
        <div className="mt-3 rounded-md border bg-background/70 px-3 py-2 text-sm leading-5">
          {projection.requiresUserAction ? (isEn ? "Action Required: " : "需要你处理：") : (isEn ? "Pause Reason: " : "暂停原因：")}{attentionText}
        </div>
      ) : null}

      {detailText && detailText !== attentionText ? (
        <div className="mt-3 rounded-md border bg-background/70 px-3 py-2 text-sm leading-5">
          {detailText}
        </div>
      ) : null}

      {helperLines.length > 0 && !compact ? (
        <div className="mt-3 space-y-2">
          {helperLines.map((line) => (
            <div key={line} className="rounded-md border bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {usageSummary ? (
        <div className="mt-3 rounded-md border bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <div className="font-medium text-foreground">{isEn ? "AI Usage" : "AI 用量"}</div>
          <div className="mt-1">{formatUsageLine(usageSummary, isEn)}</div>
          {promptUsage.length > 0 && !compact ? (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">{isEn ? "Stage Usage" : "阶段用量"}</div>
              {promptUsage.map((item) => (
                <div key={`${item.promptAssetKey}:${item.promptVersion ?? ""}:${item.nodeKey ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 border-t pt-1">
                  <span className="min-w-0 truncate text-foreground">
                    {getDirectorNodeDisplayLabel({ label: item.label ?? item.promptAssetKey, nodeKey: item.nodeKey })}
                  </span>
                  <span className="shrink-0">{formatUsageLine(item, isEn)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {stepUsage.length > 0 && !compact ? (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">{isEn ? "Execution Steps" : "推进步骤"}</div>
              {stepUsage.map((item) => (
                <div key={item.stepIdempotencyKey} className="flex flex-wrap items-center justify-between gap-2 border-t pt-1">
                  <span className="min-w-0 truncate text-foreground">
                    {getDirectorNodeDisplayLabel({ label: item.label, nodeKey: item.nodeKey })}
                  </span>
                  <span className="shrink-0">{formatUsageLine(item, isEn)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-background/70 px-2 py-1">{isEn ? "Policy Mode: " : "推进方式："}{formatPolicyMode(projection.policyMode, isEn)}</span>
        <span className="rounded-full bg-background/70 px-2 py-1">{isEn ? "Updated: " : "更新时间："}{formatDate(projection.updatedAt, i18n.language)}</span>
      </div>

      {recentEvents.length > 0 && !compact ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{isEn ? "Recent Progress" : "最近进展"}</div>
          {recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-md border bg-background/70 px-3 py-2 text-xs leading-5">
              <div className="text-foreground">{event.summary}</div>
              <div className="mt-1 text-muted-foreground">{formatDate(event.occurredAt, i18n.language)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
