import type { NovelWorkflowCheckpoint, NovelWorkflowLane, NovelWorkflowResumeTarget, NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import { buildNovelCreateResumeTarget, parseResumeTarget } from "./novelWorkflow.shared";
import {
  defaultProgressForStage,
  resolveCheckpointItemLabelFromRow,
  resolveCheckpointStageFromRow,
  stageLabel,
} from "./novelWorkflow.helpers";

export interface NovelWorkflowCheckpointRestoreSource {
  checkpointType?: string | null;
  status?: string | null;
  finishedAt?: Date | null;
  lane?: string | null;
  novelId?: string | null;
  resumeTargetJson?: string | null;
  currentItemLabel?: string | null;
  progress?: number | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
}

export interface NovelWorkflowCheckpointRestoreResult {
  checkpointStage: NovelWorkflowStage;
  resumeTarget: NovelWorkflowResumeTarget;
  data: {
    status: "succeeded" | "waiting_approval";
    pendingManualRecovery: false;
    finishedAt: Date | null;
    cancelRequestedAt: null;
    heartbeatAt: Date;
    currentStage: string;
    currentItemKey: string;
    currentItemLabel: string | null;
    progress: number;
    resumeTargetJson: string | null;
    lastError: null;
  };
}

export function buildRestoreTaskToCheckpointResult(input: {
  taskId: string;
  existing: NovelWorkflowCheckpointRestoreSource;
  buildResumeTarget: (params: {
    taskId: string;
    novelId: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }) => NovelWorkflowResumeTarget;
}): NovelWorkflowCheckpointRestoreResult | null {
  if (!input.existing.checkpointType) {
    return null;
  }
  const checkpointType = input.existing.checkpointType as NovelWorkflowCheckpoint;
  const checkpointStage = resolveCheckpointStageFromRow({
    checkpointType,
    status: input.existing.status,
  });
  const resumeTarget = checkpointType === "candidate_selection_required"
    ? buildNovelCreateResumeTarget(input.taskId, "director")
      : (
      parseResumeTarget(input.existing.resumeTargetJson) ?? input.buildResumeTarget({
        taskId: input.taskId,
        novelId: input.existing.novelId ?? null,
        lane: (input.existing.lane ?? "auto_director") as NovelWorkflowLane,
        stage: checkpointStage,
      })
    );

  return {
    checkpointStage,
    resumeTarget,
    data: {
      status: checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
      pendingManualRecovery: false,
      finishedAt: checkpointType === "workflow_completed"
        ? (input.existing.finishedAt ?? new Date())
        : null,
      cancelRequestedAt: null,
      heartbeatAt: new Date(),
      currentStage: stageLabel(checkpointStage),
      currentItemKey: checkpointStage,
      currentItemLabel: resolveCheckpointItemLabelFromRow({
        checkpointType,
        status: input.existing.status,
      }) ?? input.existing.currentItemLabel ?? null,
      progress: Math.max(input.existing.progress ?? 0, defaultProgressForStage(checkpointStage)),
      resumeTargetJson: JSON.stringify(resumeTarget),
      lastError: null,
    },
  };
}
