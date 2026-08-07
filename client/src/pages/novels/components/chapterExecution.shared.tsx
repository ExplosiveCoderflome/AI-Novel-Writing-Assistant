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
  { key: "execution_plan", label: "execution plan" },
  { key: "writing", label: "text writing" },
  { key: "review", label: "review" },
  { key: "repair", label: "repair" },
  { key: "state_sync", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { key: "payoff_sync", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { key: "ready", label: "Can continue to advance" },
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
        ? "The execution plan for this chapter is ready."
        : "This chapter still lacks an execution plan. The system will first prepare a task list or scene breakdown.";
    case "writing":
      return stage.status === "in_progress"
        ? "AI is writing the main text of this chapter."
        : "The execution plan is now ready and you can start writing the text.";
    case "review":
      return stage.status === "in_progress"
        ? "The text has been generated and is being reviewed by the system."
        : "The text already contains content, and the next step will be review.";
    case "repair":
      return stage.status === "in_progress"
        ? "The system is fixing the text based on the problem."
        : "If problems are found during the review, the repair phase will be entered.";
    case "state_sync":
      return stage.status === "in_progress"
        ? "The text is readable, and the system is feeding back the status of this chapter, character changes, and key resources."
        : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "payoff_sync":
      return stage.status === "in_progress"
        ? "The system is calibrating the foreshadowing ledger involved in this chapter."
        : "After the assets are reintroduced, the system will calibrate the foreshadowing ledger according to risk and rhythm.";
    case "ready":
    default:
      return stage.status === "done"
        ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        : stage.status === "in_progress"
          ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          : "After completing the previous steps, you can move forward with this chapter.";
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
      return "To be prepared";
    case "pending_generation":
      return "To be written";
    case "generating":
      return "Writing";
    case "pending_review":
      return "Reviewed";
    case "needs_repair":
      return "Suggested fixes";
    case "completed":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    default:
      return "not set";
  }
}

export function chapterStatusDescription(status?: Chapter["chapterStatus"] | null): string {
  switch (status) {
    case "unplanned":
      return "To be prepared: This chapter still lacks execution materials. Usually, chapter objectives, task lists or scene cards need to be supplemented first.";
    case "pending_generation":
      return "To be written: The chapter plan is basically ready and the text can be started.";
    case "generating":
      return "Writing: AI is generating the text of this chapter, or is finishing the post-generation process.";
    case "pending_review":
      return "Reviewed: The text has completed the current round of review. You can view suggestions, continue editing directly, or address issues as needed.";
    case "needs_repair":
      return "Recommended fix: The review uncovered the problem but does not prevent further editing. You can fix it with one click or continue writing first.";
    case "completed":
      return "Completed: This chapter has passed the current process and can be polished or moved on to the next chapter.";
    default:
      return "Not set: The current chapter has no clear process status.";
  }
}

export function generationStateLabel(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "Already cataloged";
    case "drafted":
      return "Completed";
    case "reviewed":
      return "Reviewed";
    case "repaired":
      return "Fixed";
    case "approved":
      return "Confirmed";
    case "published":
      return "Published";
    default:
      return "";
  }
}

export function generationStateDescription(state?: Chapter["generationState"] | null): string {
  switch (state) {
    case "planned":
      return "Already included in the Table of Contents: The chapter has been included in the Table of Contents or has been split into chapters, but there is no text draft yet.";
    case "drafted":
      return "Completed: A draft of the text has been generated, but the review and confirmation has not yet been completed.";
    case "reviewed":
      return "Reviewed: A round of review has been completed and may be repaired or confirmed later.";
    case "repaired":
      return "Fixed: It has been repaired based on the problem. Usually the next step is to review or confirm again.";
    case "approved":
      return "Confirmed: This chapter has passed the current quality threshold and will be considered completed and skipped when automatically executed.";
    case "published":
      return "Published: This chapter has entered the published state and will not be regenerated automatically.";
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; } function qualityLoopActionLabel(value: unknown): string | null { switch (value) { case "continue": return "Quality can continue"; case "patch_repair": return "Repair is recommended"; case "replan": return "Replanning is recommended"; case "manual_gate": return "Repair boundary needs to be confirmed"; default: return null; } } function qualityLoopStatusLabel(value: unknown): string | null { switch (value) { case "risk": return "Quality is at risk"; case "invalid": return "Quality needs to be repaired"; case "missing": return "Quality information is missing"; default: return null; } } function qualityLoopArtifactLabel(value: unknown): string | null { switch (value) { case "chapter_retention_contract": return "Retention risk"; case "continuity_state": return "Continuity risk"; case "rolling_window_review": return "Chapter transition risk"; case "prose_quality": return "Text naturalness/degradation detection"; default: return null; } } function parseStructuredRiskFlagsObject(input: string): Record<string, unknown> | null {
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
      labels.push("Recorded quality debt");
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
    .filter((item) => item.length > 0) .slice(0, 4); } export function hasText(input: string | null | undefined): boolean { return Boolean(input?.trim()); } export function chapterHasPreparationAssets(chapter: Chapter): boolean { return hasText(chapter.expectation) || hasText(chapter.taskSheet) || hasText(chapter.sceneCards); } export function parseChapterScenePlanForDisplay(chapter: Chapter) { return parseChapterScenePlan(chapter.sceneCards, { targetWordCount: chapter.targetWordCount ?? undefined, }); } export function resolveChapterQueuePreview(chapter: Chapter): string { if (hasText(chapter.expectation)) { return chapter.expectation!.trim(); } if (hasText(chapter.taskSheet)) { return chapter.taskSheet!.trim(); } const scenePlan = parseChapterScenePlanForDisplay(chapter); if (scenePlan) { const firstScene = scenePlan.scenes[0]; return firstScene ? `${firstScene.title} · ${firstScene.purpose}` : "This chapter has generated a scene budget contract."; } if (hasText(chapter.sceneCards)) { return "This chapter has an old version of scene breakdown, it is recommended to regenerate."; } return "This chapter does not yet have a clear goal, it is suitable to fill in the chapter plan first."; } export function chapterSuggestedActionLabel(chapter: Chapter): string { if (chapterHasContinuableQualityLoop(chapter)) { return hasText(chapter.content) ? "Continue to the next chapter" : "Write this chapter"; } const status = resolveDisplayedChapterStatus(chapter); if (status === "generating") return "Waiting for generation"; if (status === "needs_repair") return "One-click repair"; if (status === "pending_review") { return chapter.generationState === "reviewed" || chapter.generationState === "approved" ? "View suggestions" : "Run proofreading"; } if (status === "completed") return "Continue polishing"; if (status === "unplanned" || !chapterHasPreparationAssets(chapter)) return "Supplementing chapter plan"; if (!hasText(chapter.content) || status === "pending_generation") return "Writing this chapter"; if (chapter.generationState === "drafted") return "Run proofreading"; return "Open editor"; } export function chapterMatchesQueueFilter(chapter: Chapter, filter: QueueFilterKey): boolean { const status = resolveDisplayedChapterStatus(chapter); if (filter === "all") return true; if (filter === "completed") { return status === "completed" || chapter.generationState === "approved" || chapter.generationState === "published"; } if (filter === "review") { return status === "pending_review" || status === "needs_repair" || chapter.generationState === "drafted" || chapter.generationState === "reviewed"; } if (filter === "setup") { return status === "unplanned" || (!chapterHasPreparationAssets(chapter) && !hasText(chapter.content));
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
