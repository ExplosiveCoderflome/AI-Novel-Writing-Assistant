import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import type {
  AuditReport,
  Chapter,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import {
  classifyChapterQualityLoopRisk,
  hasContinuableChapterQualityLoopRiskFlags,
} from "@ai-novel/shared/types/chapterQualityLoop";
import { Link } from "react-router-dom";
import AiButton from "@/components/common/AiButton";
import AiActionLabel from "@/components/common/AiActionLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AssetTabKey = "content" | "taskSheet" | "sceneCards" | "quality" | "repair";
export type QueueFilterKey = "all" | "setup" | "draft" | "review" | "completed";
export type ChapterExecutionFlowStageKey =
  | "execution_plan"
  | "writing"
  | "review"
  | "repair"
  | "state_sync"
  | "payoff_sync"
  | "ready";
export type ChapterExecutionFlowStageStatus = "not_started" | "in_progress" | "done";
export type ChapterExecutionBackgroundActivityKind = "character_dynamics" | "state_snapshot" | "payoff_ledger" | "character_resources";
export type ChapterExecutionBackgroundActivityStatus = "running" | "failed";

export interface ChapterExecutionBackgroundActivity {
  kind: ChapterExecutionBackgroundActivityKind;
  status: ChapterExecutionBackgroundActivityStatus;
  chapterId: string;
  chapterOrder?: number;
  chapterTitle?: string;
  updatedAt: string;
  error?: string | null;
}

export type PrimaryAction = {
  label: string;
  reason: string;
  variant: "default" | "secondary" | "outline";
  ai?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

export type QueueFilterOption = {
  key: QueueFilterKey;
  label: string;
  count: number;
};

/**
 * 手动新建的空白章节尚未进入任何生产步骤时，才允许从章节执行队列移除。
 * 这里刻意不按标题判断，避免用户改名后失去操作能力，也避免误删 AI 已规划的章节。
 */
export function canRemoveEmptyManualChapter(chapter: Chapter): boolean {
  return chapter.generationState === "planned"
    && (chapter.chapterStatus ?? "unplanned") === "unplanned"
    && !chapter.content?.trim()
    && !chapter.expectation?.trim()
    && !chapter.taskSheet?.trim()
    && !chapter.sceneCards?.trim()
    && !chapter.repairHistory?.trim()
    && !chapter.riskFlags?.trim();
}

export interface ChapterExecutionFlowStage {
  key: ChapterExecutionFlowStageKey;
  label: string;
  status: ChapterExecutionFlowStageStatus;
}

interface ResolveChapterExecutionFlowInput {
  selectedChapter: Chapter | undefined;
  chapterAuditReports: AuditReport[];
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  chapterStateSnapshot?: StoryStateSnapshot | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  repairRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  isStreaming?: boolean;
  streamingChapterId?: string | null;
  isRepairStreaming?: boolean;
  repairStreamingChapterId?: string | null;
  isRunningFullAudit?: boolean;
  backgroundActivities?: ChapterExecutionBackgroundActivity[] | null;
}

const CHAPTER_EXECUTION_FLOW_ORDER: Array<{ key: ChapterExecutionFlowStageKey; label: string }> = [
  { key: "execution_plan", label: i18next.t("novels.chapterExecution.shared.czfymu") },
  { key: "writing", label: i18next.t("novels.chapterExecution.shared.dyvcdj") },
  { key: "review", label: i18next.t("novels.chapterExecution.shared.g5o7") },
  { key: "repair", label: i18next.t("dict.gen_f82661e8") },
  { key: "state_sync", label: i18next.t("novels.chapterExecution.shared.evc0tg") },
  { key: "payoff_sync", label: i18next.t("novels.chapterExecution.shared.ahfche") },
  { key: "ready", label: i18next.t("novels.chapterExecution.shared.afu8s8") },
];

function hasOpenAuditIssues(reports: AuditReport[]): boolean {
  return reports.some((report) => report.issues.some((issue) => issue.status === "open"));
}

function hasBackgroundActivity(
  activities: ChapterExecutionBackgroundActivity[] | null | undefined,
  kind: ChapterExecutionBackgroundActivity["kind"],
  chapterId: string,
): boolean {
  return (activities ?? []).some((item) => item.kind === kind && item.status === "running" && item.chapterId === chapterId);
}

function hasRuntimeLedgerData(runtimePackage: ChapterRuntimePackage | null | undefined): boolean {
  if (!runtimePackage) {
    return false;
  }
  const context = runtimePackage.context;
  return Boolean(
    context.ledgerSummary
    || context.ledgerPendingItems.length > 0
    || context.ledgerUrgentItems.length > 0
    || context.ledgerOverdueItems.length > 0,
  );
}

function hasRuntimeResourceData(runtimePackage: ChapterRuntimePackage | null | undefined): boolean {
  const context = runtimePackage?.context.characterResourceContext;
  return Boolean(
    context
    && (
      context.availableItems.length > 0
      || context.setupNeededItems.length > 0
      || context.blockedItems.length > 0
      || context.highRiskCommittedItems.length > 0
      || context.pendingProposalItems.length > 0
      || context.riskSignals.length > 0
    ),
  );
}

function buildCurrentStageNote(stage: ChapterExecutionFlowStage): string {
  switch (stage.key) {
    case "execution_plan":
      return stage.status === "done"
        ? "这一章的执行计划已经齐备。"
        : "这章还缺执行计划，系统会先准备任务单或场景拆解。";
    case "writing":
      return stage.status === "in_progress"
        ? "AI 正在写这一章的正文。"
        : "执行计划已具备，可以开始写正文。";
    case "review":
      return stage.status === "in_progress"
        ? "正文已生成，系统正在审核。"
        : "正文已有内容，下一步会进入审核。";
    case "repair":
      return stage.status === "in_progress"
        ? "系统正在根据问题修复正文。"
        : "如果审核发现问题，这里会进入修复阶段。";
    case "state_sync":
      return stage.status === "in_progress"
        ? "正文可读，系统正在回灌本章状态、角色变化和关键资源。"
        : "正文可读后，系统会回灌本章状态和关键资源。";
    case "payoff_sync":
      return stage.status === "in_progress"
        ? "系统正在校准本章涉及的伏笔账本。"
        : "资产回灌后，系统会按风险和节奏校准伏笔账本。";
    case "ready":
    default:
      return stage.status === "done"
        ? "这章已经达到可继续推进的状态。"
        : stage.status === "in_progress"
          ? "这章已经完成当前轮审核。你可以继续编辑，也可以先处理建议。"
          : "完成前面步骤后，这章就可以继续推进。";
  }
}

export function resolveChapterExecutionFlow(input: ResolveChapterExecutionFlowInput): {
  stages: ChapterExecutionFlowStage[];
  currentStage: ChapterExecutionFlowStage & { note: string };
} {
  const chapter = input.selectedChapter;
  const chapterId = chapter?.id ?? "";
  const isCurrentChapterWriting = Boolean(
    chapter && input.isStreaming && input.streamingChapterId === chapter.id,
  );
  const isCurrentChapterRepairing = Boolean(
    chapter && input.isRepairStreaming && input.repairStreamingChapterId === chapter.id,
  );
  const currentStateSnapshot = input.chapterRuntimePackage?.context.stateSnapshot
    ?? input.chapterStateSnapshot
    ?? (input.latestStateSnapshot?.sourceChapterId === chapterId ? input.latestStateSnapshot : null);

  const stages: ChapterExecutionFlowStage[] = CHAPTER_EXECUTION_FLOW_ORDER.map(({ key, label }) => {
    if (!chapter) {
      return {
        key,
        label,
        status: "not_started",
      };
    }

    switch (key) {
      case "execution_plan":
        return {
          key,
          label,
          status: chapter.taskSheet?.trim() || chapter.sceneCards?.trim()
            ? "done"
            : "not_started",
        };
      case "writing":
        return {
          key,
          label,
          status: isCurrentChapterWriting || chapter.chapterStatus === "generating"
            ? "in_progress"
            : chapter.content?.trim()
              ? "done"
              : "not_started",
        };
      case "review":
        return {
          key,
          label,
          status: (input.isRunningFullAudit || (isCurrentChapterWriting && input.chapterRunStatus?.phase === "finalizing"))
            ? "in_progress"
            : (input.chapterAuditReports.length > 0 || chapter.generationState === "reviewed" || chapter.generationState === "approved" || chapter.generationState === "published")
              ? "done"
              : "not_started",
        };
      case "repair":
        return {
          key,
          label,
          status: isCurrentChapterRepairing
            ? "in_progress"
            : (chapter.generationState === "repaired" || Boolean(chapter.repairHistory?.trim()))
              ? "done"
              : "not_started",
        };
      case "state_sync":
        return {
          key,
          label,
          status: hasBackgroundActivity(input.backgroundActivities, "state_snapshot", chapterId)
            || hasBackgroundActivity(input.backgroundActivities, "character_resources", chapterId)
            ? "in_progress"
            : (currentStateSnapshot || hasRuntimeResourceData(input.chapterRuntimePackage))
              ? "done"
              : "not_started",
        };
      case "payoff_sync":
        return {
          key,
          label,
          status: hasBackgroundActivity(input.backgroundActivities, "payoff_ledger", chapterId)
            ? "in_progress"
            : (hasRuntimeLedgerData(input.chapterRuntimePackage) || Boolean(currentStateSnapshot?.foreshadowStates?.length))
              ? "done"
              : "not_started",
        };
      case "ready":
      default:
        return {
          key,
          label,
          status: chapter.chapterStatus === "completed" || chapter.generationState === "approved" || chapter.generationState === "published"
            ? "done"
            : chapter.chapterStatus === "pending_review" && !hasOpenAuditIssues(input.chapterAuditReports)
              ? "in_progress"
              : "not_started",
        };
    }
  });

  const currentStage = stages.find((stage) => stage.status === "in_progress")
    ?? stages.find((stage) => stage.status === "not_started")
    ?? stages[stages.length - 1]!;

  return {
    stages,
    currentStage: {
      ...currentStage,
      note: buildCurrentStageNote(currentStage),
    },
  };
}

export function resolveDisplayedChapterStatus(chapter: Chapter): Chapter["chapterStatus"] | null | undefined {
  const status = chapter.chapterStatus;
  if (!hasText(chapter.content)) {
    return status;
  }
  if (chapter.generationState === "approved" || chapter.generationState === "published") {
    return "completed";
  }
  if (
    chapterHasContinuableQualityLoop(chapter)
    && (chapter.generationState === "reviewed" || chapter.generationState === "repaired")
  ) {
    return "pending_review";
  }
  if (status === "generating" && (chapter.generationState === "reviewed" || chapter.generationState === "repaired")) {
    return "pending_review";
  }
  if (status === "needs_repair" && chapterHasContinuableQualityLoop(chapter)) {
    return "pending_review";
  }
  if (status === "pending_generation") {
    return "pending_review";
  }
  return status;
}

export function chapterStatusLabel(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return i18next.t("dict.gen_5a562457");
    case "pending_generation":
      return i18next.t("dict.gen_9c3c4a2c");
    case "generating":
      return i18next.t("novels.chapterExecution.shared.cc6ui");
    case "pending_review":
      return i18next.t("novels.chapterExecution.shared.e7j0y");
    case "needs_repair":
      return i18next.t("dict.gen_c94222f6");
    case "completed":
      return i18next.t("tasks.filterStatusSucceeded");
    default:
      return i18next.t("dict.gen_fe2d26a2");
  }
}

export function chapterStatusDescription(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return i18next.t("novels.chapterExecution.shared.i88lqy");
    case "pending_generation":
      return i18next.t("novels.chapterExecution.shared.rq3vo6");
    case "generating":
      return i18next.t("novels.chapterExecution.shared.c8duqs");
    case "pending_review":
      return i18next.t("novels.chapterExecution.shared.jkb1ma");
    case "needs_repair":
      return i18next.t("novels.chapterExecution.shared.uwtwqz");
    case "completed":
      return i18next.t("novels.chapterExecution.shared.540d76");
    default:
      return i18next.t("novels.chapterExecution.shared.sybmoj");
  }
}

export function generationStateLabel(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return i18next.t("novels.chapterExecution.shared.c72gii");
    case "drafted":
      return i18next.t("novels.chapterExecution.shared.e8q01");
    case "reviewed":
      return i18next.t("novels.chapterExecution.shared.e7j0y");
    case "repaired":
      return i18next.t("novels.chapterExecution.shared.e5gep");
    case "approved":
      return i18next.t("novels.chapterExecution.shared.ecmeg");
    case "published":
      return i18next.t("common.published");
    default:
      return "";
  }
}

export function generationStateDescription(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return i18next.t("novels.chapterExecution.shared.8vshpi");
    case "drafted":
      return i18next.t("novels.chapterExecution.shared.7bhfnv");
    case "reviewed":
      return i18next.t("novels.chapterExecution.shared.qqbcu5");
    case "repaired":
      return i18next.t("novels.chapterExecution.shared.k8hbc7");
    case "approved":
      return i18next.t("novels.chapterExecution.shared.hmv2wk");
    case "published":
      return i18next.t("novels.chapterExecution.shared.tigv67");
    default:
      return "";
  }
}

export function shouldShowGenerationStateBadge(state?: Chapter["generationState"] | null): boolean {
  return Boolean(state && state !== "planned");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringifyRiskLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function qualityLoopActionLabel(value: unknown): string | null {
  switch (value) {
    case "continue":
      return i18next.t("novels.chapterExecution.shared.2f40em");
    case "patch_repair":
      return i18next.t("novels.chapterExecution.shared.h8dyf");
    case "replan":
      return i18next.t("novels.chapterExecution.shared.yfiew7");
    case "manual_gate":
      return i18next.t("novels.chapterExecution.shared.1nburt");
    default:
      return null;
  }
}

function qualityLoopStatusLabel(value: unknown): string | null {
  switch (value) {
    case "risk":
      return i18next.t("novels.chapterExecution.shared.2i19nh");
    case "invalid":
      return i18next.t("novels.chapterExecution.shared.2opgbc");
    case "missing":
      return i18next.t("novels.chapterExecution.shared.3chdvw");
    default:
      return null;
  }
}

function qualityLoopArtifactLabel(value: unknown): string | null {
  switch (value) {
    case "chapter_retention_contract":
      return i18next.t("novels.chapterExecution.shared.f6ydve");
    case "continuity_state":
      return i18next.t("novels.chapterExecution.shared.chm6fl");
    case "rolling_window_review":
      return i18next.t("novels.chapterExecution.shared.7sepam");
    case "prose_quality":
      return i18next.t("novels.chapterExecution.shared.o3g8hm");
    default:
      return null;
  }
}

function parseStructuredRiskFlagsObject(input: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

export function chapterHasContinuableQualityLoop(chapter: Pick<Chapter, "riskFlags">): boolean {
  return hasContinuableChapterQualityLoopRiskFlags(chapter.riskFlags);
}

function parseStructuredRiskFlags(input: string): string[] | null {
  const parsed = parseStructuredRiskFlagsObject(input);
  if (!parsed) return null;
  const labels: string[] = [];
  const qualityLoop = parsed.qualityLoop;
  if (isRecord(qualityLoop)) {
    const qualityLoopRisk = classifyChapterQualityLoopRisk(qualityLoop);
    if (qualityLoopRisk === "non_blocking_quality_debt") {
      labels.push("已记录质量债务");
    } else {
      const actionLabel = qualityLoopActionLabel(qualityLoop.recommendedAction);
      const statusLabel = qualityLoopStatusLabel(qualityLoop.overallStatus);
      if (actionLabel) labels.push(actionLabel);
      if (statusLabel) labels.push(statusLabel);
    }
    const signals = Array.isArray(qualityLoop.signals) ? qualityLoop.signals : [];
    signals.forEach((signal) => {
      if (!isRecord(signal) || signal.status === "valid") {
        return;
      }
      const label = qualityLoopArtifactLabel(signal.artifactType);
      if (label) {
        labels.push(label);
      }
    });
  }
  const extraLabels = Object.entries(parsed)
    .filter(([key]) => key !== "qualityLoop")
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .map(stringifyRiskLabel)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set([...labels, ...extraLabels])).slice(0, 4);
}

export function parseRiskFlags(input: string | null | undefined): string[] {
  if (!input?.trim()) {
    return [];
  }
  const structured = parseStructuredRiskFlags(input.trim());
  if (structured) {
    return structured;
  }
  return input
    .split(/[\n,，;；|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 4);
}

export function hasText(input: string | null | undefined): boolean {
  return Boolean(input?.trim());
}

export function chapterHasPreparationAssets(chapter: Chapter): boolean {
  return hasText(chapter.expectation) || hasText(chapter.taskSheet) || hasText(chapter.sceneCards);
}

export function parseChapterScenePlanForDisplay(chapter: Chapter) {
  const { t } = useTranslation();
  return parseChapterScenePlan(chapter.sceneCards, {
    targetWordCount: chapter.targetWordCount ?? undefined,
  });
}

export function resolveChapterQueuePreview(chapter: Chapter): string {
  if (hasText(chapter.expectation)) {
    return chapter.expectation!.trim();
  }
  if (hasText(chapter.taskSheet)) {
    return chapter.taskSheet!.trim();
  }
  const scenePlan = parseChapterScenePlanForDisplay(chapter);
  if (scenePlan) {
    const firstScene = scenePlan.scenes[0];
    return firstScene
      ? `${firstScene.title} · ${firstScene.purpose}`
      : "这一章已生成场景预算合同。";
  }
  if (hasText(chapter.sceneCards)) {
    return i18next.t("novels.chapterExecution.shared.idfut4");
  }
  return i18next.t("novels.chapterExecution.shared.xl6mlc");
}

export function chapterSuggestedActionLabel(chapter: Chapter): string {
  if (chapterHasContinuableQualityLoop(chapter)) {
    return hasText(chapter.content) ? "继续下一章" : "写本章";
  }
  const status = resolveDisplayedChapterStatus(chapter);
  if (status === "generating") return i18next.t("novels.chapterExecution.shared.fyclrh");
  if (status === "needs_repair") return i18next.t("dict.fixButton");
  if (status === "pending_review") {
    return chapter.generationState === "reviewed" || chapter.generationState === "approved"
      ? "查看建议"
      : "运行审校";
  }
  if (status === "completed") return i18next.t("novels.chapterExecution.shared.gjce0i");
  if (status === "unplanned" || !chapterHasPreparationAssets(chapter)) return i18next.t("novels.chapterExecution.shared.iwegrs");
  if (!hasText(chapter.content) || status === "pending_generation") return i18next.t("dict.gen_dc9c1e62");
  if (chapter.generationState === "drafted") return i18next.t("novels.chapterExecution.shared.iperks");
  return i18next.t("novels.chapterExecution.shared.t7z2qo");
}

export function chapterMatchesQueueFilter(chapter: Chapter, filter: QueueFilterKey): boolean {
  const status = resolveDisplayedChapterStatus(chapter);
  if (filter === "all") return true;
  if (filter === "completed") {
    return status === "completed"
      || chapter.generationState === "approved"
      || chapter.generationState === "published";
  }
  if (filter === "review") {
    return status === "pending_review"
      || status === "needs_repair"
      || chapter.generationState === "drafted"
      || chapter.generationState === "reviewed";
  }
  if (filter === "setup") {
    return status === "unplanned" || (!chapterHasPreparationAssets(chapter) && !hasText(chapter.content));
  }
  if (filter === "draft") {
    return status === "pending_generation"
      || status === "generating"
      || (!hasText(chapter.content) && status !== "unplanned");
  }
  return true;
}

export function MetricBadge(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

export function RiskBadgeList(props: { risks: string[] }) {
  if (props.risks.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {props.risks.map((risk) => <Badge key={risk} variant="secondary">{risk}</Badge>)}
    </div>
  );
}

export function PrimaryActionButton(props: { action: PrimaryAction | null; className?: string }) {
  const { action, className } = props;
  if (!action) {
    return null;
  }
  if (action.href) {
    return (
      <Button asChild size="sm" variant={action.variant} className={className}>
        <Link to={action.href}>
          {action.ai ? <AiActionLabel>{action.label}</AiActionLabel> : action.label}
        </Link>
      </Button>
    );
  }
  return (
    action.ai ? (
      <AiButton size="sm" variant={action.variant} className={className} onClick={action.onClick} disabled={action.disabled}>
        {action.label}
      </AiButton>
    ) : (
      <Button size="sm" variant={action.variant} className={className} onClick={action.onClick} disabled={action.disabled}>
        {action.label}
      </Button>
    )
  );
}
