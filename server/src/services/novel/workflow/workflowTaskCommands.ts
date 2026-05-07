import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { AppError } from "../../../middleware/errorHandler";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  mergeSeedPayload,
  parseMilestones,
  parseResumeTarget,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";
import {
  CHECKPOINT_ITEM_LABELS,
  CHECKPOINT_STAGE_MAP,
  defaultProgressForStage,
  isTaskCancellationRequested,
  stageLabel,
  SyncWorkflowStageInput,
} from "./novelWorkflowServiceSupport";

export interface WorkflowTaskCommandDeps {
  getVisibleRowById(taskId: string): Promise<any>;
  getVisibleRowByIdRaw(taskId: string): Promise<any>;
  buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget;
  updateWorkflowTaskWithNotifications(input: { before: any; data: any }): Promise<any>;
  updateTaskWithRetry(args: { where: { id: string }; data: any }): Promise<any>;
  bootstrapTask(input: { novelId: string; lane: "manual_create" }): Promise<any>;
}

export async function markTaskRunning(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  },
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  const resumeTarget = deps.buildResumeTarget({
    taskId,
    novelId: existing.novelId,
    lane: existing.lane,
    stage: input.stage,
    chapterId: input.chapterId,
    volumeId: input.volumeId,
  });
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "running",
      startedAt: existing.startedAt ?? new Date(),
      finishedAt: null,
      heartbeatAt: new Date(),
      pendingManualRecovery: false,
      currentStage: stageLabel(input.stage),
      currentItemKey: input.itemKey ?? input.stage,
      currentItemLabel: input.itemLabel,
      progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),
      checkpointType: input.clearCheckpoint ? null : existing.checkpointType,
      checkpointSummary: input.clearCheckpoint ? null : existing.checkpointSummary,
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
      seedPayloadJson: input.seedPayload
        ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
        : existing.seedPayloadJson,
      lastError: null,
      cancelRequestedAt: null,
    },
  });
}

export async function markTaskWaitingApproval(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    checkpointType?: NovelWorkflowCheckpoint | null;
    checkpointSummary?: string | null;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  },
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  const resumeTarget = deps.buildResumeTarget({
    taskId,
    novelId: existing.novelId,
    lane: existing.lane,
    stage: input.stage,
    chapterId: input.chapterId,
    volumeId: input.volumeId,
  });
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "waiting_approval",
      finishedAt: null,
      heartbeatAt: new Date(),
      currentStage: stageLabel(input.stage),
      currentItemKey: input.itemKey ?? input.stage,
      currentItemLabel: input.itemLabel,
      progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),
      checkpointType: input.clearCheckpoint
        ? null
        : (input.checkpointType ?? existing.checkpointType),
      checkpointSummary: input.clearCheckpoint
        ? null
        : (input.checkpointSummary ?? existing.checkpointSummary),
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
      seedPayloadJson: input.seedPayload
        ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
        : existing.seedPayloadJson,
      lastError: null,
      cancelRequestedAt: null,
    },
  });
}

export async function markTaskFailed(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  message: string,
  patch?: Partial<SyncWorkflowStageInput>,
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    return null;
  }
  if (isTaskCancellationRequested(existing)) {
    return existing;
  }
  const stage = patch?.stage ?? "auto_director";
  const resumeTarget = parseResumeTarget(existing.resumeTargetJson) ?? deps.buildResumeTarget({
    taskId,
    novelId: existing.novelId,
    lane: existing.lane,
    stage,
    chapterId: patch?.chapterId,
    volumeId: patch?.volumeId,
  });
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "failed",
      finishedAt: new Date(),
      heartbeatAt: new Date(),
      currentStage: patch?.stage ? stageLabel(patch.stage) : existing.currentStage,
      currentItemKey: patch?.itemKey ?? existing.currentItemKey,
      currentItemLabel: patch?.itemLabel ?? existing.currentItemLabel,
      checkpointType: patch?.checkpointType ?? existing.checkpointType,
      checkpointSummary: patch?.checkpointSummary ?? existing.checkpointSummary,
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
      lastError: message.trim(),
    },
  });
}

export async function cancelTask(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Task not found.", 404);
  }
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "cancelled",
      cancelRequestedAt: new Date(),
      finishedAt: new Date(),
      heartbeatAt: new Date(),
    },
  });
}

export async function retryTask(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Task not found.", 404);
  }
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: existing.checkpointType ? "waiting_approval" : "queued",
      pendingManualRecovery: false,
      attemptCount: existing.attemptCount + 1,
      lastError: null,
      finishedAt: null,
      cancelRequestedAt: null,
      heartbeatAt: new Date(),
    },
  });
}

export async function restoreTaskToCheckpoint(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  row = null as any,
) {
  const existing = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!existing || !existing.checkpointType) {
    return existing;
  }
  const checkpointType = existing.checkpointType as NovelWorkflowCheckpoint;
  const checkpointStage = CHECKPOINT_STAGE_MAP[checkpointType];
  const resumeTarget = checkpointType === "candidate_selection_required"
    ? buildNovelCreateResumeTarget(taskId, "director")
    : (
      parseResumeTarget(existing.resumeTargetJson) ?? deps.buildResumeTarget({
        taskId,
        novelId: existing.novelId,
        lane: existing.lane,
        stage: checkpointStage,
      })
    );
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
      pendingManualRecovery: false,
      finishedAt: checkpointType === "workflow_completed" ? (existing.finishedAt ?? new Date()) : null,
      cancelRequestedAt: null,
      heartbeatAt: new Date(),
      currentStage: stageLabel(checkpointStage),
      currentItemKey: checkpointStage,
      currentItemLabel: CHECKPOINT_ITEM_LABELS[checkpointType] ?? existing.currentItemLabel,
      progress: Math.max(existing.progress, defaultProgressForStage(checkpointStage)),
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
      lastError: null,
    },
  });
}

export async function continueTask(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      heartbeatAt: new Date(),
      pendingManualRecovery: false,
      status: existing.status === "queued" ? "running" : existing.status,
    },
  });
}

export async function requeueTaskForRecovery(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  message: string,
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Task not found.", 404);
  }
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "queued",
      pendingManualRecovery: true,
      finishedAt: null,
      cancelRequestedAt: null,
      heartbeatAt: null,
      lastError: message.trim(),
    },
  });
}

export async function recordCandidateSelectionRequired(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  input: {
    seedPayload?: Record<string, unknown>;
    summary: string;
  },
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: "waiting_approval",
      currentStage: stageLabel("auto_director"),
      currentItemKey: "auto_director",
      currentItemLabel: "等待确认书级方向",
      checkpointType: "candidate_selection_required",
      checkpointSummary: input.summary,
      resumeTargetJson: stringifyResumeTarget(buildNovelCreateResumeTarget(taskId, "director")),
      progress: Math.max(existing.progress, defaultProgressForStage("auto_director")),
      heartbeatAt: new Date(),
      seedPayloadJson: input.seedPayload
        ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
        : existing.seedPayloadJson,
      milestonesJson: appendMilestone(existing.milestonesJson, "candidate_selection_required", input.summary),
    },
  });
}

export async function recordRewriteSnapshotMilestone(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  input: {
    summary: string;
  },
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  return deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      heartbeatAt: new Date(),
      milestonesJson: JSON.stringify([
        ...parseMilestones(existing.milestonesJson),
        {
          checkpointType: "rewrite_snapshot_created",
          summary: input.summary,
          createdAt: new Date().toISOString(),
        },
      ]),
    },
  });
}

export async function recordCheckpoint(
  deps: WorkflowTaskCommandDeps,
  taskId: string,
  input: {
    stage: NovelWorkflowStage;
    checkpointType: NovelWorkflowCheckpoint;
    checkpointSummary: string;
    itemLabel: string;
    chapterId?: string | null;
    volumeId?: string | null;
    progress?: number;
    seedPayload?: Record<string, unknown>;
  },
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  if (isTaskCancellationRequested(existing)) {
    throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
  }
  const resumeTarget = deps.buildResumeTarget({
    taskId,
    novelId: existing.novelId,
    lane: existing.lane,
    stage: input.stage,
    chapterId: input.chapterId,
    volumeId: input.volumeId,
  });
  return deps.updateWorkflowTaskWithNotifications({
    before: existing,
    data: {
      status: input.checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
      progress: input.progress ?? defaultProgressForStage(input.stage),
      currentStage: stageLabel(input.stage),
      currentItemKey: input.stage,
      currentItemLabel: input.itemLabel,
      checkpointType: input.checkpointType,
      checkpointSummary: input.checkpointSummary,
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
      heartbeatAt: new Date(),
      finishedAt: input.checkpointType === "workflow_completed" ? new Date() : null,
      seedPayloadJson: input.seedPayload
        ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
        : existing.seedPayloadJson,
      milestonesJson: appendMilestone(existing.milestonesJson, input.checkpointType, input.checkpointSummary),
      lastError: null,
    },
  });
}
