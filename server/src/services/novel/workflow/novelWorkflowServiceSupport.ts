import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import type { DirectorWorkflowSeedPayload } from "../../director/helpers";
import {
  NOVEL_WORKFLOW_STAGE_LABELS,
  NOVEL_WORKFLOW_STAGE_PROGRESS,
  parseResumeTarget,
  parseSeedPayload,
} from "./novelWorkflow.shared";

export type WorkflowRow = Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>>;

export interface AutoDirectorNovelCreationClaim {
  status: "claimed" | "attached" | "in_progress";
  task: WorkflowRow;
}

export interface BootstrapWorkflowInput {
  workflowTaskId?: string | null;
  novelId?: string | null;
  lane: NovelWorkflowLane;
  title?: string | null;
  seedPayload?: Record<string, unknown>;
  forceNew?: boolean;
}

export interface SyncWorkflowStageInput {
  stage: NovelWorkflowStage;
  itemLabel: string;
  itemKey?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
  progress?: number;
  status?: TaskStatus;
}

export interface ChapterBatchCheckpointRow {
  title: string;
  novelId: string | null;
  status: string;
  checkpointType: string | null;
  currentItemLabel: string | null;
  checkpointSummary: string | null;
  resumeTargetJson: string | null;
  seedPayloadJson: string | null;
  lastError: string | null;
  finishedAt: Date | null;
  milestonesJson: string | null;
}

export const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"] as const;

export const CHECKPOINT_STAGE_MAP: Record<NovelWorkflowCheckpoint, NovelWorkflowStage> = {
  candidate_selection_required: "auto_director",
  book_contract_ready: "story_macro",
  character_setup_required: "character_setup",
  volume_strategy_ready: "volume_strategy",
  front10_ready: "chapter_execution",
  chapter_batch_ready: "quality_repair",
  replan_required: "quality_repair",
  workflow_completed: "quality_repair",
};

export const CHECKPOINT_ITEM_LABELS: Record<NovelWorkflowCheckpoint, string> = {
  candidate_selection_required: "等待确认书级方向",
  book_contract_ready: "Book Contract 已就绪",
  character_setup_required: "等待审核角色准备",
  volume_strategy_ready: "卷战略已就绪",
  front10_ready: "已准备章节可进入执行",
  chapter_batch_ready: "自动执行已暂停",
  replan_required: "等待处理重规划建议",
  workflow_completed: "小说主流程已完成",
};

export function buildChapterTitleDiversityTaskNotice(input: {
  issue: string;
  volumeId?: string | null;
}) {
  return {
    code: "CHAPTER_TITLE_DIVERSITY",
    summary: input.issue.trim(),
    action: {
      type: "open_structured_outline" as const,
      label: "快速修复章节标题",
      volumeId: input.volumeId?.trim() || null,
    },
  };
}

export function parseSeedResumeTarget(seedPayloadJson: string | null | undefined) {
  const seedPayload = parseSeedPayload<{ resumeTarget?: unknown }>(seedPayloadJson);
  if (typeof seedPayload?.resumeTarget === "string") {
    return parseResumeTarget(seedPayload.resumeTarget);
  }
  if (seedPayload?.resumeTarget && typeof seedPayload.resumeTarget === "object") {
    return seedPayload.resumeTarget as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

export function mergeResumeTargets(
  primary: ReturnType<typeof parseResumeTarget>,
  fallback: ReturnType<typeof parseResumeTarget>,
) {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }
  return {
    ...fallback,
    ...primary,
    stage: primary.stage === "basic" && fallback.stage !== "basic"
      ? fallback.stage
      : primary.stage,
    chapterId: primary.chapterId ?? fallback.chapterId ?? null,
    volumeId: primary.volumeId ?? fallback.volumeId ?? null,
  };
}

export function isQueuedWorkflowItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "project_setup" || itemKey === "auto_director" || !itemKey;
}

export function isCandidateSelectionItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "auto_director" || itemKey?.startsWith("candidate_") === true;
}

export function hasCandidateSelectionPhase(seedPayloadJson: string | null | undefined): boolean {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
  if (!seedPayload) {
    return false;
  }
  if (seedPayload.candidateStage) {
    return true;
  }
  const phase = seedPayload.directorSession && typeof seedPayload.directorSession === "object"
    ? (seedPayload.directorSession as { phase?: unknown }).phase
    : null;
  return phase === "candidate_selection";
}

export function isPreNovelAutoDirectorCandidateTask(row: {
  lane?: string | null;
  novelId?: string | null;
  checkpointType?: string | null;
  currentItemKey?: string | null;
  seedPayloadJson?: string | null;
} | null): boolean {
  return Boolean(
    row
    && row.lane === "auto_director"
    && !row.novelId
    && (
      row.checkpointType === "candidate_selection_required"
      || isCandidateSelectionItemKey(row.currentItemKey)
      || hasCandidateSelectionPhase(row.seedPayloadJson)
    ),
  );
}

export function isChapterBatchCheckpointRow(
  row: ChapterBatchCheckpointRow | {
    title?: string | null;
    novelId?: string | null;
    status?: string | null;
    checkpointType?: string | null;
    currentItemLabel?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    lastError?: string | null;
    finishedAt?: Date | null;
    milestonesJson?: string | null;
  } | null,
): row is ChapterBatchCheckpointRow {
  return Boolean(
    row
    && typeof row.title === "string"
    && typeof row.status === "string"
    && Object.prototype.hasOwnProperty.call(row, "resumeTargetJson")
    && Object.prototype.hasOwnProperty.call(row, "seedPayloadJson")
    && Object.prototype.hasOwnProperty.call(row, "finishedAt")
    && Object.prototype.hasOwnProperty.call(row, "milestonesJson"),
  );
}

export function mapStageToTab(stage: NovelWorkflowStage): NovelWorkflowResumeTarget["stage"] {
  if (stage === "story_macro") return "story_macro";
  if (stage === "character_setup") return "character";
  if (stage === "volume_strategy") return "outline";
  if (stage === "structured_outline") return "structured";
  if (stage === "chapter_execution") return "chapter";
  if (stage === "quality_repair") return "pipeline";
  return "basic";
}

export function defaultProgressForStage(stage: NovelWorkflowStage): number {
  return NOVEL_WORKFLOW_STAGE_PROGRESS[stage] ?? 0.08;
}

export function stageLabel(stage: NovelWorkflowStage): string {
  return NOVEL_WORKFLOW_STAGE_LABELS[stage] ?? stage;
}

export function isTaskCancellationRequested(row: {
  status?: string | null;
  cancelRequestedAt?: Date | null;
} | null | undefined): boolean {
  return Boolean(row && (row.status === "cancelled" || row.cancelRequestedAt));
}

export function isStructuredOutlineItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "beat_sheet"
    || itemKey === "chapter_list"
    || itemKey === "chapter_sync"
    || itemKey === "chapter_detail_bundle";
}
