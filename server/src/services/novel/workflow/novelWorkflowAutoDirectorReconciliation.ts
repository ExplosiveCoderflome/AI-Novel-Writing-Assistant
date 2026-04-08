import { prisma } from "../../../db/prisma";
import type { DirectorWorkflowSeedPayload } from "../director/novelDirectorHelpers";
import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";
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
    || "前 10 章自动执行未能全部通过质量要求。";
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
      generationState: true,
    },
  });
  const reconciliation = reconcileAutoDirectorChapterBatchState({
    title: existing.title,
    autoExecutionState: seedPayload?.autoExecution,
    chapters,
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
    await prisma.novelWorkflowTask.update({
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
    });
    return true;
  }

  const needsCheckpointRefresh = existing.resumeTargetJson !== nextResumeTargetJson
    || existing.seedPayloadJson !== nextSeedPayloadJson
    || existing.checkpointSummary !== reconciliation.checkpointSummary
    || existing.currentItemLabel !== reconciliation.itemLabel;
  if (!needsCheckpointRefresh) {
    return false;
  }
  await prisma.novelWorkflowTask.update({
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
  });
  return true;
}
