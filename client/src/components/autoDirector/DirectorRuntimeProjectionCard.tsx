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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DirectorRuntimeProjectionCardProps {
  projection: DirectorRuntimeProjection | null | undefined;
  className?: string;
  compact?: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "None yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "None yet";
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
    return "<1 second";
  }
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return restSeconds > 0 ? `${minutes} minutes ${restSeconds} seconds` : `${minutes} minutes`; } function formatUsageLine(usage: { llmCallCount: number; promptTokens: number; completionTokens: number; totalTokens: number; durationMs?: number | null; }): string { const duration = formatDuration(usage.durationMs); return [ `${formatTokenCount(usage.llmCallCount)} times`, `input ${formatTokenCount(usage.promptTokens)}`, `output ${formatTokenCount(usage.completionTokens)}`, `total ${formatTokenCount(usage.totalTokens)} Tokens`, duration ? `cumulative call time ${duration}` : null, ].filter(Boolean).join(" · "); } function formatPolicyMode(mode: DirectorPolicyMode): string { if (mode === "suggest_only") { return "Only suggestions are given"; } if (mode === "run_next_step") { return "Proceed to the next step"; } if (mode === "auto_safe_scope") { return "Automatically proceed within safe scope"; } return "Proceeded to checkpoint"; } function formatStatus(status: DirectorRuntimeProjectionStatus): string { if (status === "running") { return "Proceeding"; } if (status === "waiting_approval") { return "Waiting for confirmation"; } if (status === "blocked") { return "Paused"; } if (status === "failed") { return "Failed"; } if (status === "completed") { return "Completed"; } return "Pending start"; } function statusClassName(status: DirectorRuntimeProjectionStatus): string { if (status === "running") { return "border-sky-300 bg-sky-50 text-sky-900"; } if (status === "waiting_approval") { return "border-amber-300 bg-amber-50 text-amber-900"; } if (status === "blocked" || status === "failed") { return "border-destructive/30 bg-destructive/5 text-destructive"; } if (status === "completed") { return "border-emerald-300 bg-emerald-50 text-emerald-900"; } return "border-border bg-muted/30 text-muted-foreground"; } function statusIcon(status: DirectorRuntimeProjectionStatus) { if (status === "running") { return <Activity className="h-4 w-4" />;
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

function formatQualityDebtSummary(summary: DirectorRuntimeProjection["qualityDebtSummary"] | null | undefined): string | null {
  if (!summary || summary.deferredChapterCount <= 0) {
    return null;
  }
  const orderText = summary.deferredChapterOrders.length > 0
    ? `：第 ${summary.deferredChapterOrders.join("、")} 章`
    : "";
  return `质量待回收${orderText}。系统会先继续写后续章节，并在质量修复阶段回收这些问题。`;
}

function formatQualityBudgetSummary(summary: DirectorRuntimeProjection["qualityBudgetSummary"] | null | undefined): string | null {
  if (!summary) {
    return null;
  }
  const chapterText = typeof summary.currentChapterOrder === "number"
    ? `第 ${summary.currentChapterOrder} 章`
    : "Current Chapter";
  return `${chapterText}质量预算：局部修复 ${summary.patchRepairUsed}/1，整章重写 ${summary.chapterRewriteUsed}/1，窗口重规划 ${summary.windowReplanUsed}/1。${summary.nextActionLabel}`;
}

function formatRootCauseSummary(projection: DirectorRuntimeProjection): string | null {
  if (!projection.rootCauseCode || projection.rootCauseCode === "none") {
    return null;
  }
  if (projection.rootCauseCode === "replan_required") {
    return "The current problem comes from the mismatch of chapter responsibilities, and the system needs to adjust the arrangement of nearby chapters first.";
  }
  if (projection.rootCauseCode === "draft_obligation_unmet") {
    return "The main text has been generated, but there are still things that must be completed in this chapter that have not been fulfilled.";
  }
  if (projection.rootCauseCode === "draft_repair_exhausted") {
    return "The main text has been generated, but there are still blocking issues that need to be dealt with after automatic repair.";
  }
  return "The main text was not successfully generated and the current chapter needs to be re-executed.";
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
  if (!projection) {
    return null;
  }
  const primaryText = projection.headline?.trim()
    || projection.currentLabel?.trim()
    || projection.lastEventSummary?.trim()
    || "Waiting for synchronization of current advancement status";
  const detailText = projection.detail?.trim();
  const attentionText = projection.requiresUserAction
    ? projection.blockingReason?.trim()
      || projection.blockedReason?.trim()
      || projection.lastEventSummary?.trim()
      || "Please process the current stop first."
    : projection.blockingReason?.trim() || projection.blockedReason?.trim();
  const progressLine = projection.progressBreakdown?.explanation?.trim()
    || projection.progressSummary?.trim()
    || null;
  const qualityDebtLine = formatQualityDebtSummary(projection.qualityDebtSummary);
  const qualityBudgetLine = formatQualityBudgetSummary(projection.qualityBudgetSummary);
  const rootCauseLine = formatRootCauseSummary(projection);
  const obligationLine = projection.blockingObligations && projection.blockingObligations.length > 0
    ? `仍需处理：${projection.blockingObligations.slice(0, 3).map((item) => item.summary).join("；")}`
    : null;
  const activeExecutionLine = projection.activeExecution
    ? `后台执行：${getDirectorNodeDisplayLabel({
      nodeKey: projection.activeExecution.stepType,
      fallback: projection.currentAction || "Automatic director tasks",
    })}${projection.activeExecution.resourceClass ? ` · ${projection.activeExecution.resourceClass}` : ""}`
    : null;
  const waitingLine = projection.waitingReason ? `等待原因：${projection.waitingReason}` : null;
  const workerHealthLine = projection.workerHealth
    ? [
      `执行队列：${projection.workerHealth.queuedCommandCount} 个等待`,
      projection.workerHealth.runningCommandCount > 0 ? `${projection.workerHealth.runningCommandCount} 个处理中` : null,
      projection.workerHealth.currentWorkerId ? `执行器：${projection.workerHealth.currentWorkerId}` : null,
    ].filter(Boolean).join(" · ")
    : null;
  const helperLines = [
    activeExecutionLine,
    waitingLine,
    workerHealthLine,
    projection.nextActionLabel ? `下一步：${projection.nextActionLabel}` : null,
    projection.recommendedAction?.reason ? `推荐原因：${projection.recommendedAction.reason}` : null,
    projection.isAutopilotRecoverable ? "The AI ​​can continue processing from its current progress." : null,
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
            <div className="text-sm font-semibold text-foreground">Director's progress</div>
            <div className="mt-1 text-sm leading-5">{primaryText}</div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 bg-background/70">
          {formatStatus(projection.status)}
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
            <div className="text-[11px] text-muted-foreground">planning</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.planningProgress ?? progressBreakdown.planningPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">chapter</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{progressBreakdown.continuableChapters}/{progressBreakdown.totalChapters}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">quality</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.qualityProgress ?? progressBreakdown.qualityRepairPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Current action</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.activeJobProgress)}</div>
          </div>
        </div>
      ) : null}

      {attentionText ? (
        <div className="mt-3 rounded-md border bg-background/70 px-3 py-2 text-sm leading-5">
          {projection.requiresUserAction ? "You need to handle:" : "Reason for suspension:"}{attentionText}
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
          <div className="font-medium text-foreground">AI usage</div>
          <div className="mt-1">{formatUsageLine(usageSummary)}</div>
          {promptUsage.length > 0 && !compact ? (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">Phase dosage</div>
              {promptUsage.map((item) => (
                <div key={`${item.promptAssetKey}:${item.promptVersion ?? ""}:${item.nodeKey ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 border-t pt-1">
                  <span className="min-w-0 truncate text-foreground">
                    {getDirectorNodeDisplayLabel({ label: item.label ?? item.promptAssetKey, nodeKey: item.nodeKey })}
                  </span>
                  <span className="shrink-0">{formatUsageLine(item)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {stepUsage.length > 0 && !compact ? (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">Advance steps</div>
              {stepUsage.map((item) => (
                <div key={item.stepIdempotencyKey} className="flex flex-wrap items-center justify-between gap-2 border-t pt-1">
                  <span className="min-w-0 truncate text-foreground">
                    {getDirectorNodeDisplayLabel({ label: item.label, nodeKey: item.nodeKey })}
                  </span>
                  <span className="shrink-0">{formatUsageLine(item)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-background/70 px-2 py-1">Promotion method:{formatPolicyMode(projection.policyMode)}</span>
        <span className="rounded-full bg-background/70 px-2 py-1">Update time:{formatDate(projection.updatedAt)}</span>
      </div>

      {recentEvents.length > 0 && !compact ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Recent Progress</div>
          {recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-md border bg-background/70 px-3 py-2 text-xs leading-5">
              <div className="text-foreground">{event.summary}</div>
              <div className="mt-1 text-muted-foreground">{formatDate(event.occurredAt)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
