import { prisma } from "../../../../db/prisma";
import {
  hasDirectorAutoExecutionChapterContract,
  hasDirectorSyncedChapterExecutionContext,
  type DirectorAutoExecutionChapterRef,
} from "../automation/novelDirectorAutoExecution";
import { hasContinuableQualityLoopRiskFlags } from "./DirectorWorkspaceArtifactInventory";

export const CHAPTER_EXECUTION_PROGRESS_STAGES = [
  "execution_contract_ready",
  "context_package_ready",
  "draft_started",
  "draft_saved",
  "audit_completed",
  "repair_completed_or_not_needed",
  "runtime_package_saved",
  "chapter_artifacts_synced",
  "chapter_state_committed",
  "reviewable_or_approved",
] as const;

export type ChapterExecutionProgressStage = typeof CHAPTER_EXECUTION_PROGRESS_STAGES[number];

export type ChapterExecutionProgressStatus =
  | "not_started"
  | "running"
  | "needs_repair"
  | "reviewable"
  | "approved"
  | "completed"
  | "blocked";

export interface ChapterExecutionProgress {
  chapterId: string;
  chapterOrder: number;
  status: ChapterExecutionProgressStatus;
  currentStage: ChapterExecutionProgressStage;
  completedStages: ChapterExecutionProgressStage[];
  missingStages: ChapterExecutionProgressStage[];
  evidence: Record<string, boolean | number | string | null>;
  recoverable: boolean;
  nextAction: "write_draft" | "run_audit" | "repair_chapter" | "commit_state" | "continue_next_chapter" | "none";
}

export interface ChapterExecutionProgressSummary {
  totalChapters: number;
  draftedChapterCount: number;
  approvedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  activeChapterId: string | null;
  activeChapterOrder: number | null;
  currentChapterId: string | null;
  currentChapterOrder: number | null;
  currentStage: ChapterExecutionProgressStage | null;
  recoverableRange: {
    startOrder: number | null;
    endOrder: number | null;
  };
  ratio: number;
  chapters: ChapterExecutionProgress[];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function firstMissing(completed: Set<ChapterExecutionProgressStage>): ChapterExecutionProgressStage {
  return CHAPTER_EXECUTION_PROGRESS_STAGES.find((stage) => !completed.has(stage))
    ?? "reviewable_or_approved";
}

export class ChapterExecutionProgressInspector {
  async inspectNovel(novelId: string): Promise<ChapterExecutionProgressSummary> {
    const chapters = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        content: true,
        riskFlags: true,
        conflictLevel: true,
        revealLevel: true,
        targetWordCount: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
        expectation: true,
        generationState: true,
        chapterStatus: true,
        repairHistory: true,
        qualityReports: { select: { id: true }, take: 1 },
        auditReports: { select: { id: true, issues: { select: { id: true, status: true, severity: true }, take: 8 } }, take: 1, orderBy: { createdAt: "desc" } },
        storyStateSnapshots: { select: { id: true }, take: 1 },
        canonicalStateVersions: { select: { id: true }, take: 1 },
      },
    });
    const matrix = chapters.map((chapter) => this.inspectChapterRow(chapter));
    const active = matrix.find((chapter) => (
      chapter.status === "running" && chapter.evidence.chapterStatus === "generating"
    )) ?? null;
    const current = active
      ?? matrix.find((chapter) => chapter.status === "needs_repair")
      ?? matrix.find((chapter) => chapter.status === "not_started")
      ?? matrix.find((chapter) => chapter.status === "running")
      ?? null;
    const draftedChapterCount = matrix.filter((chapter) => chapter.completedStages.includes("draft_saved")).length;
    const approvedChapterCount = matrix.filter((chapter) => chapter.status === "approved").length;
    const completedChapters = matrix.filter((chapter) => (
      chapter.status === "approved" || chapter.status === "completed"
    )).length;
    const recoverableChapters = matrix.filter((chapter) => chapter.recoverable);
    const totalStageCount = Math.max(1, matrix.length * CHAPTER_EXECUTION_PROGRESS_STAGES.length);
    const completedStageCount = matrix.reduce((sum, chapter) => sum + chapter.completedStages.length, 0);
    return {
      totalChapters: matrix.length,
      draftedChapterCount,
      approvedChapterCount,
      completedChapters,
      needsRepairChapters: matrix.filter((chapter) => chapter.status === "needs_repair").length,
      activeChapterId: active?.chapterId ?? null,
      activeChapterOrder: active?.chapterOrder ?? null,
      currentChapterId: current?.chapterId ?? null,
      currentChapterOrder: current?.chapterOrder ?? null,
      currentStage: current?.currentStage ?? null,
      recoverableRange: {
        startOrder: recoverableChapters[0]?.chapterOrder ?? null,
        endOrder: recoverableChapters[recoverableChapters.length - 1]?.chapterOrder ?? null,
      },
      ratio: matrix.length === 0 ? 0 : completedStageCount / totalStageCount,
      chapters: matrix,
    };
  }

  inspectChapterRow(chapter: DirectorAutoExecutionChapterRef & {
    id: string;
    order: number;
    content: string | null;
    riskFlags: string | null;
    conflictLevel: number | null;
    revealLevel: number | null;
    targetWordCount: number | null;
    mustAvoid: string | null;
    taskSheet: string | null;
    sceneCards: string | null;
    expectation: string | null;
    generationState: string;
    chapterStatus: string | null;
    repairHistory: string | null;
    qualityReports: unknown[];
    auditReports: Array<{ issues: Array<{ status: string; severity: string }> }>;
    storyStateSnapshots: unknown[];
    canonicalStateVersions: unknown[];
  }): ChapterExecutionProgress {
    const completed = new Set<ChapterExecutionProgressStage>();
    const hasExecutionContext = hasDirectorSyncedChapterExecutionContext({
      id: chapter.id,
      order: chapter.order,
      content: chapter.content,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      targetWordCount: chapter.targetWordCount,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
      expectation: chapter.expectation,
      generationState: chapter.generationState,
      chapterStatus: chapter.chapterStatus,
    });
    const hasExecutableContract = hasDirectorAutoExecutionChapterContract({
      id: chapter.id,
      order: chapter.order,
      content: chapter.content,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      targetWordCount: chapter.targetWordCount,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
      generationState: chapter.generationState,
      chapterStatus: chapter.chapterStatus,
    });
    const hasDraft = hasText(chapter.content);
    const hasAudit = chapter.auditReports.length > 0 || chapter.qualityReports.length > 0;
    const hasOpenBlockingIssue = chapter.auditReports.some((report) => report.issues.some((issue) => (
      issue.status === "open" && (issue.severity === "high" || issue.severity === "critical")
    )));
    const hasContinuableRiskFlags = hasContinuableQualityLoopRiskFlags(chapter.riskFlags);
    const needsRepair = hasOpenBlockingIssue && !hasContinuableRiskFlags;
    const hasStateCommit = chapter.storyStateSnapshots.length > 0 || chapter.canonicalStateVersions.length > 0;
    const isApproved = chapter.generationState === "approved" || chapter.generationState === "published";
    const isReviewable = (hasDraft && hasAudit && !needsRepair) || isApproved;

    if (hasExecutionContext) completed.add("execution_contract_ready");
    if (hasExecutionContext) completed.add("context_package_ready");
    if (hasDraft || chapter.chapterStatus === "generating") completed.add("draft_started");
    if (hasDraft) completed.add("draft_saved");
    if (hasAudit) completed.add("audit_completed");
    if (hasAudit && !needsRepair) completed.add("repair_completed_or_not_needed");
    if (hasDraft && hasAudit) completed.add("runtime_package_saved");
    if (hasDraft) completed.add("chapter_artifacts_synced");
    if (hasStateCommit || isApproved) completed.add("chapter_state_committed");
    if (isReviewable) completed.add("reviewable_or_approved");

    const completedStages = CHAPTER_EXECUTION_PROGRESS_STAGES.filter((stage) => completed.has(stage));
    const missingStages = CHAPTER_EXECUTION_PROGRESS_STAGES.filter((stage) => !completed.has(stage));
    const currentStage = firstMissing(completed);
    const status: ChapterExecutionProgressStatus = needsRepair
      ? "needs_repair"
      : isApproved
        ? "approved"
        : isReviewable
          ? "reviewable"
          : hasDraft || chapter.chapterStatus === "generating"
            ? "running"
            : "not_started";
    const shouldContinueWithoutStateCommit = hasContinuableRiskFlags
      && isReviewable;
    const nextAction = needsRepair
      ? "repair_chapter"
      : !hasDraft
        ? "write_draft"
        : !hasAudit
          ? "run_audit"
          : !hasStateCommit && !shouldContinueWithoutStateCommit
            ? "commit_state"
            : status === "reviewable" || status === "approved" || shouldContinueWithoutStateCommit
              ? "continue_next_chapter"
              : "none";

    return {
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      status,
      currentStage,
      completedStages,
      missingStages,
      evidence: {
        hasExecutionContract: hasExecutionContext,
        hasExecutableContract,
        hasDraft,
        hasAudit,
        needsRepair,
        hasOpenBlockingIssue,
        hasStateCommit,
        isReviewable,
        generationState: chapter.generationState,
        chapterStatus: chapter.chapterStatus,
        hasContinuableRiskFlags,
      },
      recoverable: needsRepair,
      nextAction,
    };
  }
}
