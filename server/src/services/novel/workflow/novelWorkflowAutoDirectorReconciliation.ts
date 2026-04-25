import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import type { DirectorWorkflowSeedPayload } from "../director/novelDirectorHelpers";
import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  buildDirectorAutoExecutionState,
  resolveDirectorAutoExecutionRangeFromState,
  type DirectorAutoExecutionChapterRef,
} from "../director/novelDirectorAutoExecution";

const DEFAULT_AUTO_DIRECTOR_FAILURE_MESSAGE = "前 10 章自动执行未能全部通过质量要求。";
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

function parsePausedCheckpointSummary(checkpointSummary?: string | null): {
  failureMessage: string;
  remainingChapterCount: number;
  nextChapterOrder: number | null;
} | null {
  const normalizedSummary = checkpointSummary?.trim();
  if (!normalizedSummary) {
    return null;
  }
  const match = normalizedSummary.match(
    /已进入自动执行，但当前批量任务未完全完成：(.+?) (?:当前仍有 (\d+) 章待继续|当前批次已无待继续章节)(?:，建议从第 (\d+) 章继续)?。$/u,
  );
  if (!match?.[1]) {
    return null;
  }
  return {
    failureMessage: match[1].trim(),
    remainingChapterCount: match[2] ? Number(match[2]) : 0,
    nextChapterOrder: match[3] ? Number(match[3]) : null,
  };
}

function extractFailureMessageFromCheckpointSummary(checkpointSummary?: string | null): string | null {
  return parsePausedCheckpointSummary(checkpointSummary)?.failureMessage ?? null;
}

function resolveAutoDirectorFailureMessage(input: {
  checkpointSummary?: string | null;
  lastError?: string | null;
}): string {
  return input.lastError?.trim()
    || extractFailureMessageFromCheckpointSummary(input.checkpointSummary)
    || DEFAULT_AUTO_DIRECTOR_FAILURE_MESSAGE;
}

export function reconcileAutoDirectorChapterBatchState(input: {
  title: string;
  autoExecutionState?: DirectorAutoExecutionState | null;
  chapters: DirectorAutoExecutionChapterRef[];
  failureMessage?: string | null;
}): AutoDirectorChapterBatchReconciliation | null {
  const range = resolveDirectorAutoExecutionRangeFromState(input.autoExecutionState);
  if (!range) {
    return null;
  }

  const autoExecution = buildDirectorAutoExecutionState({
    range,
    chapters: input.chapters,
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

export async function syncAutoDirectorChapterBatchCheckpoint(input: {
  taskId: string;
  row: {
    title: string;
    novelId: string | null;
    status: string;
    progress?: number | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    checkpointType: string | null;
    currentItemLabel: string | null;
    checkpointSummary: string | null;
    resumeTargetJson: string | null;
    seedPayloadJson: string | null;
    lastError: string | null;
    finishedAt: Date | null;
    cancelRequestedAt?: Date | null;
    milestonesJson: string | null;
  };
}): Promise<boolean> {
  const existing = input.row;
  if (
    !existing.novelId
    || existing.checkpointType !== "chapter_batch_ready"
    || existing.status === "queued"
    || existing.status === "cancelled"
  ) {
    return false;
  }

  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
  const persistedFailureMessage = resolveAutoDirectorFailureMessage({
    checkpointSummary: existing.checkpointSummary,
    lastError: existing.lastError,
  });
  const pipelineJobId = seedPayload?.autoExecution?.pipelineJobId?.trim() || "";
  let pipelineStatus = seedPayload?.autoExecution?.pipelineStatus ?? null;
  let nextPipelineJobId = pipelineJobId;
  if (pipelineJobId) {
    const job = await prisma.generationJob.findUnique({
      where: { id: pipelineJobId },
      select: { status: true, novelId: true },
    });
    if (job?.novelId && job.novelId !== existing.novelId) {
      nextPipelineJobId = "";
      pipelineStatus = null;
    } else if (job?.status === "queued" || job?.status === "running") {
      return false;
    } else {
      pipelineStatus = (job?.status ?? null) as PipelineJobStatus | null;
      if (!job) {
        nextPipelineJobId = "";
      }
    }
  }

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
  const reconciliation = reconcileAutoDirectorChapterBatchState({
    title: existing.title,
    autoExecutionState: seedPayload?.autoExecution
      ? {
          ...seedPayload.autoExecution,
          pipelineJobId: nextPipelineJobId || null,
          pipelineStatus,
        }
      : undefined,
    chapters,
    failureMessage: persistedFailureMessage,
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
  const previousPausedSummary = parsePausedCheckpointSummary(existing.checkpointSummary);
  const shouldPreserveCheckpointSummary = !existing.lastError
    && Boolean(previousPausedSummary)
    && previousPausedSummary?.failureMessage === persistedFailureMessage
    && previousPausedSummary?.remainingChapterCount === (reconciliation.autoExecution.remainingChapterCount ?? 0)
    && (previousPausedSummary?.nextChapterOrder ?? null) === (reconciliation.autoExecution.nextChapterOrder ?? null);
  const preservedCheckpointSummary = shouldPreserveCheckpointSummary && existing.checkpointSummary?.trim()
    ? existing.checkpointSummary.trim()
    : reconciliation.checkpointSummary;

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

  const checkpointPatch = {
    status: "waiting_approval" as const,
    progress: reconciliation.progress,
    currentStage: NOVEL_WORKFLOW_STAGE_LABELS.quality_repair,
    currentItemKey: "quality_repair",
    currentItemLabel: reconciliation.itemLabel,
    checkpointType: "chapter_batch_ready" as const,
    checkpointSummary: preservedCheckpointSummary,
    resumeTargetJson: nextResumeTargetJson,
    heartbeatAt: new Date(),
    finishedAt: null,
    cancelRequestedAt: null,
    seedPayloadJson: nextSeedPayloadJson,
    lastError: null,
  };
  const needsCheckpointRefresh = existing.status !== checkpointPatch.status
    || existing.progress !== checkpointPatch.progress
    || existing.currentStage !== checkpointPatch.currentStage
    || existing.currentItemKey !== checkpointPatch.currentItemKey
    || existing.currentItemLabel !== checkpointPatch.currentItemLabel
    || existing.checkpointType !== checkpointPatch.checkpointType
    || existing.checkpointSummary !== checkpointPatch.checkpointSummary
    || existing.resumeTargetJson !== checkpointPatch.resumeTargetJson
    || existing.finishedAt !== checkpointPatch.finishedAt
    || existing.cancelRequestedAt !== checkpointPatch.cancelRequestedAt
    || existing.seedPayloadJson !== checkpointPatch.seedPayloadJson
    || existing.lastError !== checkpointPatch.lastError;
  if (!needsCheckpointRefresh) {
    return false;
  }
  await withSqliteRetry(() => prisma.novelWorkflowTask.update({
    where: { id: input.taskId },
    data: checkpointPatch,
  }), { label: "novelWorkflowTask.update" });
  return true;
}
