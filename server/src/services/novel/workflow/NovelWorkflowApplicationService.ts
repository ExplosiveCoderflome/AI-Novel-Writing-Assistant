import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import type { NovelWorkflowCheckpoint, NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import { buildNovelCreateResumeTarget, appendMilestone, defaultWorkflowTitle, mergeSeedPayload, parseMilestones, parseResumeTarget, parseSeedPayload, stringifyResumeTarget } from "./novelWorkflow.shared";
import {
  BootstrapWorkflowInput,
  SyncWorkflowStageInput,
  defaultProgressForStage,
  isPreNovelAutoDirectorCandidateTask,
  isTaskCancellationRequested,
  resolveCheckpointItemLabelFromRow,
  resolveCheckpointStageFromRow,
  stageLabel,
} from "./novelWorkflow.helpers";
import { buildRestoreTaskToCheckpointResult } from "./novelWorkflowCheckpoint";
import { applyDirectorLlmOverride, type DirectorWorkflowSeedPayload } from "../director/runtime/novelDirectorHelpers";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import { NovelWorkflowStoreService } from "./NovelWorkflowStoreService";

type WorkflowRow = Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>>;

interface AutoDirectorNovelCreationClaim {
  status: "claimed" | "attached" | "in_progress";
  task: WorkflowRow;
}

export class NovelWorkflowApplicationService {
  constructor(private readonly workflow: NovelWorkflowStoreService) {}

  private async getNovelTitle(novelId: string): Promise<string | null> {
    return this.workflow.getNovelTitle(novelId);
  }

  async bootstrapTask(input: BootstrapWorkflowInput) {
    if (input.workflowTaskId?.trim()) {
      const existing = await this.workflow.getTaskById(input.workflowTaskId.trim());
      if (existing) {
        if (existing.lane !== input.lane) {
          throw new AppError("Workflow task lane mismatch.", 409, {
            taskId: existing.id,
            existingLane: existing.lane,
            requestedLane: input.lane,
          });
        }
        if (input.novelId?.trim() && existing.novelId !== input.novelId.trim()) {
          if (isPreNovelAutoDirectorCandidateTask(existing)) {
            return existing;
          }
          const attached = await this.attachNovelToTask(existing.id, input.novelId.trim());
          if (input.seedPayload) {
            return this.workflow.updateTaskWithRetry({
              where: { id: attached.id },
              data: {
                seedPayloadJson: mergeSeedPayload(attached.seedPayloadJson, input.seedPayload),
                heartbeatAt: new Date(),
              },
            });
          }
          return attached;
        }
        if (input.seedPayload) {
          return this.workflow.updateTaskWithRetry({
            where: { id: existing.id },
            data: {
              seedPayloadJson: mergeSeedPayload(existing.seedPayloadJson, input.seedPayload),
              heartbeatAt: new Date(),
            },
          });
        }
        return existing;
      }
    }

    if (input.novelId?.trim() && input.forceNew !== true) {
      const visibleRows = await this.workflow.getVisibleRowsByNovelId(input.novelId.trim(), input.lane);
      const active = visibleRows.find((row) => ["queued", "running", "waiting_approval"].includes(row.status as string));
      if (active) {
        return active;
      }
      const latest = visibleRows[0];
      if (latest) {
        return latest;
      }
    }

    return this.workflow.createWorkflow({
      ...input,
      novelId: input.novelId?.trim() || null,
    });
  }

  async attachNovelToTask(taskId: string, novelId: string, stage: NovelWorkflowStage = "project_setup") {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    const novelTitle = await this.getNovelTitle(novelId);
    return this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        novelId,
        title: novelTitle ?? existing.title,
        progress: Math.max(existing.progress, defaultProgressForStage(stage)),
        currentStage: stageLabel(stage),
        currentItemKey: existing.lane === "auto_director"
          ? (existing.currentItemKey ?? "novel_create")
          : stage,
        currentItemLabel: existing.lane === "auto_director"
          ? (existing.currentItemLabel ?? "正在创建小说项目")
          : (stage === "project_setup" ? "小说项目已创建" : (existing.currentItemLabel ?? "已恢复小说主任务")),
        resumeTargetJson: stringifyResumeTarget(this.workflow.buildResumeTarget({
          taskId,
          novelId,
          lane: existing.lane,
          stage,
        })),
        heartbeatAt: new Date(),
      },
    });
  }

  async claimAutoDirectorNovelCreation(taskId: string, input: {
    itemLabel: string;
    progress: number;
  }): Promise<AutoDirectorNovelCreationClaim> {
    const existing = await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (existing.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks can claim novel creation.", 400);
    }
    if (existing.novelId) {
      return {
        status: "attached",
        task: existing,
      };
    }

    const now = new Date();
    const claimed = await this.workflow.updateTaskManyWithRetry({
      where: {
        id: taskId,
        lane: "auto_director",
        novelId: null,
        OR: [
          { currentItemKey: null },
          { currentItemKey: "auto_director" },
          { currentItemKey: { startsWith: "candidate_" } },
          {
            status: {
              in: ["failed", "cancelled"],
            },
          },
        ],
      },
      data: {
        status: "running",
        startedAt: existing.startedAt ?? now,
        finishedAt: null,
        heartbeatAt: now,
        progress: Math.max(existing.progress ?? 0, input.progress),
        currentStage: stageLabel("auto_director"),
        currentItemKey: "novel_create",
        currentItemLabel: input.itemLabel,
        checkpointType: null,
        checkpointSummary: null,
        lastError: null,
        cancelRequestedAt: null,
      },
    });

    const latest = await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!latest) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (latest.novelId) {
      return {
        status: "attached",
        task: latest,
      };
    }
    return {
      status: claimed.count > 0 ? "claimed" : "in_progress",
      task: latest,
    };
  }

  async markTaskRunning(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  }) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async markTaskWaitingApproval(taskId: string, input: {
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
  }) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async markTaskFailed(taskId: string, message: string, patch?: Partial<SyncWorkflowStageInput>) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      return null;
    }
    if (isTaskCancellationRequested(existing)) {
      return existing;
    }
    const stage = patch?.stage ?? "auto_director";
    const resumeTarget = parseResumeTarget(existing.resumeTargetJson) ?? this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage,
      chapterId: patch?.chapterId,
      volumeId: patch?.volumeId,
    });
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async cancelTask(taskId: string) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
      before: existing,
      data: {
        status: "cancelled",
        cancelRequestedAt: new Date(),
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  }

  async retryTask(taskId: string) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async restoreTaskToCheckpoint(
    taskId: string,
    row = null as Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>> | null,
  ) {
    const existing = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    const restored = existing
      ? buildRestoreTaskToCheckpointResult({
        taskId,
        existing,
        buildResumeTarget: (params) => this.workflow.buildResumeTarget(params),
      })
      : null;
    if (!existing || !restored) {
      return existing;
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
      before: existing,
      data: restored.data,
    });
  }

  async applyAutoDirectorLlmOverride(
    taskId: string,
    llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
  ) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (existing.lane !== "auto_director") {
      return existing;
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
    const nextSeedPayload = applyDirectorLlmOverride(seedPayload, llmOverride);
    if (!nextSeedPayload) {
      throw new AppError("当前自动导演任务缺少可覆盖的模型上下文。", 400);
    }
    return this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeedPayload),
        heartbeatAt: new Date(),
      },
    });
  }

  async continueTask(taskId: string) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
      before: existing,
      data: {
        heartbeatAt: new Date(),
        pendingManualRecovery: false,
        status: existing.status === "queued" ? "running" : existing.status,
      },
    });
  }

  async requeueTaskForRecovery(taskId: string, message: string) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async recordCandidateSelectionRequired(taskId: string, input: {
    seedPayload?: Record<string, unknown>;
    summary: string;
  }) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async recordRewriteSnapshotMilestone(taskId: string, input: {
    summary: string;
  }) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    return this.workflow.updateTaskWithRetry({
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

  async recordCheckpoint(taskId: string, input: {
    stage: NovelWorkflowStage;
    checkpointType: NovelWorkflowCheckpoint;
    checkpointSummary: string;
    itemLabel: string;
    chapterId?: string | null;
    volumeId?: string | null;
    progress?: number;
    seedPayload?: Record<string, unknown>;
  }) {
    const existing = await this.workflow.getTaskById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return this.workflow.updateWorkflowTaskWithNotifications({
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

  async syncStageByNovelId(novelId: string, input: SyncWorkflowStageInput) {
    const task = await this.bootstrapTask({
      novelId,
      lane: "manual_create",
    });
    const resumeTarget = this.workflow.buildResumeTarget({
      taskId: task.id,
      novelId,
      lane: task.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return this.workflow.updateTaskWithRetry({
      where: { id: task.id },
      data: {
        status: input.status ?? "waiting_approval",
        progress: input.progress ?? Math.max(task.progress, defaultProgressForStage(input.stage)),
        currentStage: stageLabel(input.stage),
        currentItemKey: input.itemKey ?? input.stage,
        currentItemLabel: input.itemLabel,
        checkpointType: input.checkpointType ?? task.checkpointType,
        checkpointSummary: input.checkpointSummary ?? task.checkpointSummary,
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        heartbeatAt: new Date(),
        milestonesJson: input.checkpointType && input.checkpointSummary
          ? appendMilestone(task.milestonesJson, input.checkpointType, input.checkpointSummary)
          : task.milestonesJson,
      },
    });
  }
}
