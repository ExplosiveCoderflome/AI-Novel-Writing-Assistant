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
import { Link } from "react-router-dom";
import type { DirectorIssueAction, DirectorIssueDecision } from "@ai-novel/shared/types/directorIssue";

interface DirectorRuntimeProjectionCardProps {
  projection: DirectorRuntimeProjection | null | undefined;
  className?: string;
  compact?: boolean;
}

const ISSUE_ACTION_LABELS: Record<DirectorIssueAction, string> = {
  auto_retry: "自动重试",
  continue_with_warning: "提醒后继续",
  pause_for_manual: "暂停处理",
  fail_task: "结束任务",
};

const POLICY_SOURCE_LABELS: Record<DirectorIssueDecision["policySource"], string> = {
  global: "全局规则",
  novel: "本书规则",
  task_snapshot: "任务启动规则",
  safety: "安全底线",
};

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

function formatPolicyMode(mode: DirectorPolicyMode): string {
  if (mode === "suggest_only") {
    return "只给建议";
  }
  if (mode === "run_next_step") {
    return "推进下一步";
  }
  if (mode === "auto_safe_scope") {
    return "安全范围自动推进";
  }
  return "推进到检查点";
}

function formatStatus(status: DirectorRuntimeProjectionStatus): string {
  if (status === "running") {
    return "推进中";
  }
  if (status === "waiting_approval") {
    return "等待确认";
  }
  if (status === "blocked") {
    return "已暂停";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "completed") {
    return "已完成";
  }
  return "待开始";
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
    : "当前章节";
  const automaticRepairUsed = Math.min(1, summary.patchRepairUsed + summary.chapterRewriteUsed);
  return `${chapterText}自动处理：本章修复 ${automaticRepairUsed}/1，窗口重规划 ${Math.min(1, summary.windowReplanUsed)}/1。${summary.nextActionLabel}`;
}

function formatRootCauseSummary(projection: DirectorRuntimeProjection): string | null {
  if (!projection.rootCauseCode || projection.rootCauseCode === "none") {
    return null;
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

function formatRiskAction(action: NonNullable<DirectorRuntimeProjection["latestRiskAssessment"]>["action"]): string {
  if (action === "forced_pause" || action === "pause_requested" || action === "paused") {
    return "将在当前安全节点后暂停";
  }
  if (action === "quality_debt_recorded") {
    return "已记录质量债，后续章节会继续推进";
  }
  if (action === "notified") {
    return "已发送风险提醒";
  }
  return "已记录，自动导演会继续判断下一步";
}

function riskScoreClassName(score: number): string {
  if (score >= 8) return "border-destructive/30 bg-destructive/5 text-destructive";
  if (score >= 5) return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-sky-300 bg-sky-50 text-sky-900";
}

function formatRiskCategory(category: NonNullable<DirectorRuntimeProjection["latestRiskAssessment"]>["category"]): string {
  const labels: Record<typeof category, string> = {
    planning: "规划",
    candidate_confirmation: "候选确认",
    chapter_generation: "章节生成",
    chapter_acceptance: "章节验收",
    chapter_repair: "章节修复",
    state_proposal: "状态提案",
    replan: "重规划",
    model_failure: "模型故障",
    worker_failure: "执行器故障",
    task_recovery: "任务恢复",
    protected_content: "受保护正文",
    runtime_safety: "运行时安全",
    data_integrity: "数据完整性",
    unknown: "其他",
  };
  return labels[category];
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
    || "等待同步当前推进状态";
  const detailText = projection.detail?.trim();
  const attentionText = projection.requiresUserAction
    ? projection.blockingReason?.trim()
      || projection.blockedReason?.trim()
      || projection.lastEventSummary?.trim()
      || "请先处理当前停留点。"
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
      fallback: projection.currentAction || "自动导演任务",
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
    projection.isAutopilotRecoverable ? "AI 可以从当前进度继续处理。" : null,
    rootCauseLine,
    obligationLine,
    qualityBudgetLine,
    qualityDebtLine,
    projection.scopeSummary,
    progressLine,
  ].filter((line): line is string => Boolean(line?.trim()));
  const recentEvents = projection.recentEvents.slice(0, compact ? 2 : 4);
  const recentIssues = projection.recentIssues?.slice(0, compact ? 2 : 6) ?? [];
  const usageSummary = projection.usageSummary ?? null;
  const stepUsage = projection.stepUsage?.slice(0, compact ? 2 : 4) ?? [];
  const promptUsage = projection.promptUsage?.slice(0, compact ? 2 : 6) ?? [];
  const visibleRiskBadges = projection.visibleRiskBadges?.slice(0, compact ? 3 : 6) ?? [];
  const progressBreakdown = projection.progressBreakdown ?? null;
  const latestRisk = projection.latestRiskAssessment ?? null;
  const riskHistory = projection.riskHistory ?? [];
  const affectedRiskChapters = latestRisk?.affectedChapterOrders.length
    ? `第 ${latestRisk.affectedChapterOrders.join("、")} 章`
    : "当前步骤";

  return (
    <div className={cn("rounded-lg border bg-background/80 p-3", statusClassName(projection.status), className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0">{statusIcon(projection.status)}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">导演进度</div>
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

      {latestRisk ? (
        <div className={cn("mt-3 rounded-md border px-3 py-2 text-sm leading-5", riskScoreClassName(latestRisk.score))}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">当前最高风险：{latestRisk.score}/8</span>
            <span className="text-xs">影响：{affectedRiskChapters}</span>
          </div>
          <div className="mt-1">{latestRisk.evidenceSummary}</div>
          <div className="mt-1 text-xs opacity-85">{formatRiskAction(latestRisk.action)}。下一步：{latestRisk.recommendationReason}</div>
        </div>
      ) : null}

      <details className="mt-3 rounded-md border bg-background/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-foreground">
          <span>风险事件记录</span>
          <Badge variant="outline">{projection.riskHistoryTotal ?? riskHistory.length}</Badge>
        </summary>
        <div className="space-y-2 border-t px-3 py-3">
          {riskHistory.length > 0 ? riskHistory.map((risk) => (
            <div key={risk.eventId} className={cn("rounded-md border px-3 py-2 text-xs leading-5", riskScoreClassName(risk.score))}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{risk.score}/8 · {formatRiskCategory(risk.category)}</span>
                <span>{formatDate(risk.assessedAt)}</span>
              </div>
              <div className="mt-1">{risk.evidenceSummary}</div>
              <div className="mt-1 opacity-85">
                影响：{risk.affectedChapterOrders.length > 0 ? `第 ${risk.affectedChapterOrders.join("、")} 章` : "当前任务"} · {formatRiskAction(risk.action)}
              </div>
              <div className="mt-1 opacity-85">下一步：{risk.recommendationReason}</div>
            </div>
          )) : (
            <div className="text-xs leading-5 text-muted-foreground">
              当前还没有需要评分的异常。自动导演运行后，每个需要决策的问题都会在这里留下分数、原因和处理动作。
            </div>
          )}
        </div>
      </details>

      {progressBreakdown && !compact ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">规划</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.planningProgress ?? progressBreakdown.planningPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">章节</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{progressBreakdown.continuableChapters}/{progressBreakdown.totalChapters}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">质量</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.qualityProgress ?? progressBreakdown.qualityRepairPercent)}</div>
          </div>
          <div className="rounded-md border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">当前动作</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(progressBreakdown.activeJobProgress)}</div>
          </div>
        </div>
      ) : null}

      {attentionText ? (
        <div className="mt-3 rounded-md border bg-background/70 px-3 py-2 text-sm leading-5">
          {projection.requiresUserAction ? "需要你处理：" : "暂停原因："}{attentionText}
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
          <div className="font-medium text-foreground">AI 用量</div>
          <div className="mt-1">{formatUsageLine(usageSummary)}</div>
          {promptUsage.length > 0 && !compact ? (
            <div className="mt-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">阶段用量</div>
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
              <div className="text-[11px] font-medium text-muted-foreground">推进步骤</div>
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
        <span className="rounded-full bg-background/70 px-2 py-1">推进方式：{formatPolicyMode(projection.policyMode)}</span>
        <span className="rounded-full bg-background/70 px-2 py-1">更新时间：{formatDate(projection.updatedAt)}</span>
      </div>

      {recentIssues.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">问题记录</div>
          {recentIssues.map(({ occurrence, decision }) => {
            const target = occurrence.chapterId && projection.novelId
              ? `/novels/${projection.novelId}/chapters/${occurrence.chapterId}`
              : projection.novelId ? `/novels/${projection.novelId}/edit` : null;
            return (
              <div key={occurrence.fingerprint} className="rounded-md border bg-background/70 px-3 py-2 text-xs leading-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{occurrence.summary}</span>
                  {target ? <Link className="text-primary hover:underline" to={target}>前往处理</Link> : null}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {occurrence.issueCode} · {occurrence.chapterOrder ? `第 ${occurrence.chapterOrder} 章 · ` : ""}
                  风险分 {occurrence.riskScore ?? "待评估"}
                  {decision ? ` · ${ISSUE_ACTION_LABELS[decision.action]} · ${POLICY_SOURCE_LABELS[decision.policySource]}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {recentEvents.length > 0 && !compact ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">最近进展</div>
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
