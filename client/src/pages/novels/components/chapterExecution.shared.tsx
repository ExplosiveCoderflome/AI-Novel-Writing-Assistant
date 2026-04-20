import type { SSEFrame } from "@ai-novel/shared/types/api";
import type {
  AuditReport,
  Chapter,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
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
export type ChapterExecutionBackgroundActivityKind = "character_dynamics" | "state_snapshot" | "payoff_ledger";
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
  { key: "execution_plan", label: "执行计划" },
  { key: "writing", label: "正文写作" },
  { key: "review", label: "审核" },
  { key: "repair", label: "修复" },
  { key: "state_sync", label: "状态同步" },
  { key: "payoff_sync", label: "伏笔回填" },
  { key: "ready", label: "可继续推进" },
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
        ? "系统正在同步本章状态快照与角色变化。"
        : "正文处理完成后，系统会同步本章状态。";
    case "payoff_sync":
      return stage.status === "in_progress"
        ? "系统正在回填本章涉及的伏笔状态。"
        : "状态同步完成后，系统会继续更新伏笔账本。";
    case "ready":
    default:
      return stage.status === "done"
        ? "这章已经达到可继续推进的状态。"
        : stage.status === "in_progress"
          ? "这章正在等待你确认是否继续推进。"
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
          status: chapter.taskSheet?.trim() || chapter.sceneCards?.trim() || chapter.expectation?.trim()
            ? "done"
            : "not_started",
        };
      case "writing":
        return {
          key,
          label,
          status: isCurrentChapterWriting
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
            ? "in_progress"
            : currentStateSnapshot
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
  if (status === "pending_generation") {
    if (chapter.generationState === "approved" || chapter.generationState === "published") {
      return "completed";
    }
    return "pending_review";
  }
  return status;
}

export function chapterStatusLabel(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "待准备";
    case "pending_generation":
      return "待写作";
    case "generating":
      return "写作中";
    case "pending_review":
      return "待确认";
    case "needs_repair":
      return "待修复";
    case "completed":
      return "已完成";
    default:
      return "未设置";
  }
}

export function chapterStatusDescription(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "待准备：这章还缺少执行素材，通常要先补章节目标、任务单或场景卡。";
    case "pending_generation":
      return "待写作：章节计划已基本齐备，可以开始生成正文。";
    case "generating":
      return "写作中：AI 正在生成本章正文，或正在做生成后的收尾处理。";
    case "pending_review":
      return "待确认：正文已经进入确认阶段，建议查看审校结果并决定是否继续修复或确认通过。";
    case "needs_repair":
      return "待修复：审校发现了问题，建议先修复再继续推进。";
    case "completed":
      return "已完成：本章已通过当前流程，可以继续润色或进入下一章。";
    default:
      return "未设置：当前章节还没有明确的流程状态。";
  }
}

export function generationStateLabel(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "已入目录";
    case "drafted":
      return "已成稿";
    case "reviewed":
      return "已审校";
    case "repaired":
      return "已修复";
    case "approved":
      return "已确认";
    case "published":
      return "已发布";
    default:
      return "";
  }
}

export function generationStateDescription(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "已入目录：章节已进入目录或拆章结果，但还没有正文草稿。";
    case "drafted":
      return "已成稿：已经生成过正文草稿，但还没完成审校确认。";
    case "reviewed":
      return "已审校：已经完成一轮审校，后续可能继续修复或确认。";
    case "repaired":
      return "已修复：已经根据问题修过一轮，通常下一步是再次审校或确认。";
    case "approved":
      return "已确认：本章已通过当前质量门槛，自动执行时会视为已完成并跳过。";
    case "published":
      return "已发布：本章已进入发布状态，自动执行不会再重复生成。";
    default:
      return "";
  }
}

export function shouldShowGenerationStateBadge(state?: Chapter["generationState"] | null): boolean {
  return Boolean(state && state !== "planned");
}

export function parseRiskFlags(input: string | null | undefined): string[] {
  if (!input?.trim()) {
    return [];
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
    return "这章存在旧版场景拆解，建议重新生成。";
  }
  return "这一章还没有明确目标，适合先补章节计划。";
}

export function chapterSuggestedActionLabel(chapter: Chapter): string {
  const status = resolveDisplayedChapterStatus(chapter);
  if (status === "generating") return "等待生成";
  if (status === "needs_repair") return "修复问题";
  if (status === "pending_review") {
    return chapter.generationState === "reviewed" || chapter.generationState === "approved"
      ? "确认结果"
      : "运行审校";
  }
  if (status === "completed") return "继续润色";
  if (status === "unplanned" || !chapterHasPreparationAssets(chapter)) return "补章节计划";
  if (!hasText(chapter.content) || status === "pending_generation") return "写本章";
  if (chapter.generationState === "drafted") return "运行审校";
  return "打开编辑器";
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
