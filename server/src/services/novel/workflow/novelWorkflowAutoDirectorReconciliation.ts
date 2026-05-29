import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import type { DirectorWorkflowSeedPayload } from "../director/runtime/novelDirectorHelpers";
import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  buildDirectorAutoExecutionState,
  resolveDirectorAutoExecutionBookRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
  type DirectorAutoExecutionChapterRef,
} from "../director/automation/novelDirectorAutoExecution";
import {
  appendMilestone,
  buildNovelEditResumeTarget,
  parseSeedPayload,
  stringifyResumeTarget,
  NOVEL_WORKFLOW_STAGE_LABELS,
} from "./novelWorkflow.shared";

export interface AutoDirectorChapterBatchReconciliation {
  autoExecution: DirectorAutoExecutionState;
  checkpointType: "chapter_batch_ready" | "workflow_completed";
  checkpointSummary: string;
  itemLabel: string;
  chapterId: string | null;
  progress: number;
}

type ActiveAutoExecutionJob = NonNullable<Awaited<ReturnType<typeof prisma.generationJob.findUnique>>>;

export interface ActiveAutoExecutionResolution {
  job: ActiveAutoExecutionJob;
  autoExecution: DirectorAutoExecutionState;
  nextStatus: "queued" | "running";
  currentStage: string;
  currentItemKey: "chapter_execution" | "quality_repair";
  currentItemLabel: string;
  progress: number;
  resumeTargetJson: string;
  seedPayloadJson: string;
}

function parsePipelineWorkflowTaskId(payload: string | null | undefined): string | null {
  if (!payload?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as { workflowTaskId?: unknown };
    return typeof parsed.workflowTaskId === "string" && parsed.workflowTaskId.trim()
      ? parsed.workflowTaskId.trim()
      : null;
  } catch {
    return null;
  }
}

function isActivePipelineStatus(status: string | null | undefined): status is "queued" | "running" {
  return status === "queued" || status === "running";
}

export async function resolveActiveAutoDirectorAutoExecution(input: {
  taskId: string;
  row: {
    novelId?: string | null;
    seedPayloadJson?: string | null;
  };
}): Promise<ActiveAutoExecutionResolution | null> {
  const novelId = input.row.novelId;
  if (!novelId) {
    return null;
  }

  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(input.row.seedPayloadJson);
  const autoExecution = seedPayload?.autoExecution;
  const pipelineJobId = autoExecution?.pipelineJobId?.trim();
  if (!autoExecution || !pipelineJobId) {
    return null;
  }

  const job = await prisma.generationJob.findUnique({
    where: { id: pipelineJobId },
  });
  if (!job || job.novelId !== novelId || !isActivePipelineStatus(job.status)) {
    return null;
  }
  const payloadTaskId = parsePipelineWorkflowTaskId(job.payload);
  if (payloadTaskId && payloadTaskId !== input.taskId) {
    return null;
  }

  const nextAutoExecution = {
    ...autoExecution,
    pipelineJobId: job.id,
    pipelineStatus: job.status,
  };
  const chapters = nextAutoExecution.mode === "book"
    ? await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    })
    : [];
  const range = nextAutoExecution.mode === "book"
    ? resolveDirectorAutoExecutionBookRange(chapters)
    : resolveDirectorAutoExecutionRangeFromState(nextAutoExecution);
  if (!range) {
    return null;
  }

  const runningState = resolveDirectorAutoExecutionWorkflowState(job, range, nextAutoExecution);
  const resumeTargetJson = stringifyResumeTarget(buildNovelEditResumeTarget({
    novelId,
    taskId: input.taskId,
    stage: runningState.stage === "quality_repair" ? "pipeline" : "chapter",
    chapterId: nextAutoExecution.nextChapterId ?? nextAutoExecution.firstChapterId ?? range.firstChapterId,
  }));
  if (!resumeTargetJson) {
    return null;
  }
  return {
    job,
    autoExecution: nextAutoExecution,
    nextStatus: job.status === "queued" ? "queued" : "running",
    currentStage: NOVEL_WORKFLOW_STAGE_LABELS[runningState.stage],
    currentItemKey: runningState.itemKey,
    currentItemLabel: runningState.itemLabel,
    progress: runningState.progress,
    resumeTargetJson,
    seedPayloadJson: JSON.stringify({
      ...(seedPayload ?? {}),
      autoExecution: nextAutoExecution,
    }),
  };
}

export async function syncActiveAutoDirectorAutoExecutionTaskState(input: {
  taskId: string;
  row: {
    novelId?: string | null;
    lane?: string | null;
    status?: string | null;
    progress?: number | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    lastError?: string | null;
    finishedAt?: Date | null;
    cancelRequestedAt?: Date | null;
    pendingManualRecovery?: boolean | null;
  };
}): Promise<{ active: boolean; healed: boolean }> {
  const existing = input.row;
  if (existing.lane !== "auto_director" || existing.pendingManualRecovery || existing.cancelRequestedAt) {
    return { active: false, healed: false };
  }

  const activeExecution = await resolveActiveAutoDirectorAutoExecution(input);
  if (!activeExecution) {
    return { active: false, healed: false };
  }

  const nextProgress = Math.max(existing.progress ?? 0, activeExecution.progress);
  const needsUpdate = existing.status !== activeExecution.nextStatus
    || existing.currentStage !== activeExecution.currentStage
    || existing.currentItemKey !== activeExecution.currentItemKey
    || existing.currentItemLabel !== activeExecution.currentItemLabel
    || existing.checkpointType !== null
    || existing.checkpointSummary !== null
    || existing.resumeTargetJson !== activeExecution.resumeTargetJson
    || existing.seedPayloadJson !== activeExecution.seedPayloadJson
    || Boolean(existing.lastError?.trim())
    || Boolean(existing.finishedAt)
    || Boolean(existing.cancelRequestedAt);
  if (!needsUpdate) {
    return { active: true, healed: false };
  }

  await withSqliteRetry(() => prisma.novelWorkflowTask.update({
    where: { id: input.taskId },
    data: {
      status: activeExecution.nextStatus,
      progress: nextProgress,
      currentStage: activeExecution.currentStage,
      currentItemKey: activeExecution.currentItemKey,
      currentItemLabel: activeExecution.currentItemLabel,
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: activeExecution.resumeTargetJson,
      heartbeatAt: new Date(),
      finishedAt: null,
      cancelRequestedAt: null,
      seedPayloadJson: activeExecution.seedPayloadJson,
      lastError: null,
    },
  }), { label: "novelWorkflowTask.update" });
  return { active: true, healed: true };
}

export function reconcileAutoDirectorChapterBatchState(input: {
  title: string;
  autoExecutionState?: DirectorAutoExecutionState | null;
  chapters: DirectorAutoExecutionChapterRef[];
  failureMessage?: string | null;
}): AutoDirectorChapterBatchReconciliation | null {
  const range = input.autoExecutionState?.mode === "book"
    ? resolveDirectorAutoExecutionBookRange(input.chapters)
    : resolveDirectorAutoExecutionRangeFromState(input.autoExecutionState);
  if (!range) {
    return null;
  }

  const autoExecution = buildDirectorAutoExecutionState({
    range,
    chapters: input.chapters,
    plan: input.autoExecutionState,
    pipelineJobId: input.autoExecutionState?.pipelineJobId ?? null,
    pipelineStatus: input.autoExecutionState?.pipelineStatus ?? null,
  });

  if ((autoExecution.remainingChapterCount ?? 0) === 0) {
    return {
      autoExecution,
      checkpointType: "workflow_completed",
      checkpointSummary: buildDirectorAutoExecutionCompletedSummary({
        title: input.title,
        scopeLabel: buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount),
      }),
      itemLabel: buildDirectorAutoExecutionCompletedLabel(
        buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount),
      ),
      chapterId: autoExecution.firstChapterId ?? range.firstChapterId,
      progress: 1,
    };
  }

  const failureMessage = input.failureMessage?.trim()
    || `${buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount)}自动执行未能全部通过质量要求。`;
  return {
    autoExecution,
    checkpointType: "chapter_batch_ready",
    checkpointSummary: buildDirectorAutoExecutionPausedSummary({
      scopeLabel: buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount),
      remainingChapterCount: autoExecution.remainingChapterCount ?? 0,
      nextChapterOrder: autoExecution.nextChapterOrder ?? null,
      failureMessage,
    }),
    itemLabel: buildDirectorAutoExecutionPausedLabel(autoExecution),
    chapterId: autoExecution.nextChapterId ?? range.firstChapterId,
    progress: 0.98,
  };
}

function normalizeChapterContentForReconciliation(chapter: DirectorAutoExecutionChapterRef): string {
  if (typeof chapter.content === "string") {
    return chapter.content;
  }
  if (Object.prototype.hasOwnProperty.call(chapter, "content")) {
    return "";
  }
  return (
    chapter.generationState === "reviewed"
    || chapter.generationState === "repaired"
    || chapter.generationState === "approved"
    || chapter.generationState === "published"
    || chapter.chapterStatus === "completed"
      ? "status-confirmed"
      : ""
  );
}

export async function syncAutoDirectorChapterBatchCheckpoint(input: {
  taskId: string;
  row: {
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
  };
}): Promise<boolean> {
  const existing = input.row;
  if (
    !existing.novelId
    || existing.checkpointType !== "chapter_batch_ready"
    || existing.status === "queued"
    || existing.status === "running"
    || existing.status === "cancelled"
  ) {
    return false;
  }

  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
  const chapters = await prisma.chapter.findMany({
    where: {
      novelId: existing.novelId,
    },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      content: true,
      generationState: true,
      chapterStatus: true,
    },
  });
  const chaptersWithContent = chapters.map((chapter) => ({
    ...chapter,
    content: normalizeChapterContentForReconciliation(chapter),
  }));
  const reconciliation = reconcileAutoDirectorChapterBatchState({
    title: existing.title,
    autoExecutionState: seedPayload?.autoExecution,
    chapters: chaptersWithContent,
    failureMessage: existing.lastError,
  });
  if (!reconciliation) {
    return false;
  }

  const nextResumeTargetJson = stringifyResumeTarget(buildNovelEditResumeTarget({
    novelId: existing.novelId,
    taskId: input.taskId,
    stage: "pipeline",
    chapterId: reconciliation.chapterId,
  }));
  const nextSeedPayloadJson = JSON.stringify({
    ...(seedPayload ?? {}),
    autoExecution: reconciliation.autoExecution,
  });

  if (reconciliation.checkpointType === "workflow_completed") {
    const needsCompletionUpdate = existing.status !== "succeeded"
      || existing.checkpointSummary !== reconciliation.checkpointSummary
      || existing.currentItemLabel !== reconciliation.itemLabel
      || existing.resumeTargetJson !== nextResumeTargetJson
      || existing.seedPayloadJson !== nextSeedPayloadJson
      || existing.lastError;
    if (!needsCompletionUpdate) {
      return false;
    }
    await withSqliteRetry(() => prisma.novelWorkflowTask.update({
      where: { id: input.taskId },
      data: {
        status: "succeeded",
        progress: reconciliation.progress,
        currentStage: NOVEL_WORKFLOW_STAGE_LABELS.quality_repair,
        currentItemKey: "quality_repair",
        currentItemLabel: reconciliation.itemLabel,
        checkpointType: "workflow_completed",
        checkpointSummary: reconciliation.checkpointSummary,
        resumeTargetJson: nextResumeTargetJson,
        heartbeatAt: new Date(),
        finishedAt: existing.finishedAt ?? new Date(),
        cancelRequestedAt: null,
        seedPayloadJson: nextSeedPayloadJson,
        milestonesJson: appendMilestone(existing.milestonesJson, "workflow_completed", reconciliation.checkpointSummary),
        lastError: null,
      },
    }), { label: "novelWorkflowTask.update" });
    return true;
  }

  const needsCheckpointRefresh = existing.resumeTargetJson !== nextResumeTargetJson
    || existing.seedPayloadJson !== nextSeedPayloadJson
    || existing.checkpointSummary !== reconciliation.checkpointSummary
    || existing.currentItemLabel !== reconciliation.itemLabel;
  if (!needsCheckpointRefresh) {
    return false;
  }
  await withSqliteRetry(() => prisma.novelWorkflowTask.update({
    where: { id: input.taskId },
    data: {
      currentStage: NOVEL_WORKFLOW_STAGE_LABELS.quality_repair,
      currentItemKey: "quality_repair",
      currentItemLabel: reconciliation.itemLabel,
      checkpointSummary: reconciliation.checkpointSummary,
      resumeTargetJson: nextResumeTargetJson,
      heartbeatAt: new Date(),
      seedPayloadJson: nextSeedPayloadJson,
    },
  }), { label: "novelWorkflowTask.update" });
  return true;
}
