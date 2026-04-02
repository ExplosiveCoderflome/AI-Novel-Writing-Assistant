import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { AppError } from "../../../middleware/errorHandler";
import { getArchivedTaskIdSet, isTaskArchived } from "../../task/taskArchive";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import {
  applyDirectorLlmOverride,
  type DirectorWorkflowSeedPayload,
} from "../director/novelDirectorHelpers";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  buildNovelEditResumeTarget,
  defaultWorkflowTitle,
  mergeSeedPayload,
  NOVEL_WORKFLOW_STAGE_LABELS,
  NOVEL_WORKFLOW_STAGE_PROGRESS,
  parseSeedPayload,
  parseResumeTarget,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";

type WorkflowRow = Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>>;

interface BootstrapWorkflowInput {
  workflowTaskId?: string | null;
  novelId?: string | null;
  lane: NovelWorkflowLane;
  title?: string | null;
  seedPayload?: Record<string, unknown>;
  forceNew?: boolean;
}

interface SyncWorkflowStageInput {
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

const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"] as const;

function mapStageToTab(stage: NovelWorkflowStage): NovelWorkflowResumeTarget["stage"] {
  if (stage === "story_macro") return "story_macro";
  if (stage === "character_setup") return "character";
  if (stage === "volume_strategy") return "outline";
  if (stage === "structured_outline") return "structured";
  if (stage === "chapter_execution") return "chapter";
  if (stage === "quality_repair") return "pipeline";
  return "basic";
}

function defaultProgressForStage(stage: NovelWorkflowStage): number {
  return NOVEL_WORKFLOW_STAGE_PROGRESS[stage] ?? 0.08;
}

function stageLabel(stage: NovelWorkflowStage): string {
  return NOVEL_WORKFLOW_STAGE_LABELS[stage] ?? stage;
}

export class NovelWorkflowService {
  private async getVisibleRowsByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        novelId,
        ...(lane ? { lane } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows.filter((row) => !archived.has(row.id));
  }

  private async getVisibleRowById(taskId: string) {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }
    return prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
    });
  }

  async findLatestVisibleTaskByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows[0] ?? null;
  }

  async findActiveTaskByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) ?? null;
  }

  async listRecoverableAutoDirectorTasks() {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        lane: "auto_director",
        status: {
          in: ["queued", "running"],
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
      },
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows.filter((row) => !archived.has(row.id));
  }

  async getTaskById(taskId: string) {
    return this.getVisibleRowById(taskId);
  }

  async applyAutoDirectorLlmOverride(
    taskId: string,
    llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
  ) {
    const existing = await this.getVisibleRowById(taskId);
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
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeedPayload),
        heartbeatAt: new Date(),
      },
    });
  }

  private async getNovelTitle(novelId: string): Promise<string | null> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { title: true },
    });
    return novel?.title ?? null;
  }

  private buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget {
    if (!input.novelId) {
      return buildNovelCreateResumeTarget(input.taskId, input.lane === "auto_director" ? "director" : null);
    }
    return buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      stage: mapStageToTab(input.stage),
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
  }

  private async createWorkflow(input: BootstrapWorkflowInput) {
    const novelTitle = input.novelId ? await this.getNovelTitle(input.novelId) : null;
    const created = await prisma.novelWorkflowTask.create({
      data: {
        novelId: input.novelId ?? null,
        lane: input.lane,
        title: defaultWorkflowTitle({
          lane: input.lane,
          title: input.title,
          novelTitle,
        }),
        status: "queued",
        progress: input.novelId ? defaultProgressForStage("project_setup") : 0,
        currentStage: input.lane === "auto_director" ? "AI 自动导演" : "项目设定",
        currentItemKey: input.lane === "auto_director" ? "auto_director" : "project_setup",
        currentItemLabel: input.lane === "auto_director" ? "等待生成候选方向" : "等待创建项目",
        resumeTargetJson: stringifyResumeTarget(
          this.buildResumeTarget({
            taskId: "",
            novelId: input.novelId ?? null,
            lane: input.lane,
            stage: input.lane === "auto_director" ? "auto_director" : "project_setup",
          }),
        ),
        seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
      },
    });
    const resumeTarget = this.buildResumeTarget({
      taskId: created.id,
      novelId: created.novelId,
      lane: created.lane,
      stage: created.lane === "auto_director" ? "auto_director" : "project_setup",
    });
    return prisma.novelWorkflowTask.update({
      where: { id: created.id },
      data: {
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
      },
    });
  }

  async bootstrapTask(input: BootstrapWorkflowInput) {
    if (input.workflowTaskId?.trim()) {
      const existing = await this.getVisibleRowById(input.workflowTaskId.trim());
      if (existing) {
        if (input.novelId?.trim() && existing.novelId !== input.novelId.trim()) {
          const attached = await this.attachNovelToTask(existing.id, input.novelId.trim());
          if (input.seedPayload) {
            return prisma.novelWorkflowTask.update({
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
          return prisma.novelWorkflowTask.update({
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
      const visibleRows = await this.getVisibleRowsByNovelId(input.novelId.trim(), input.lane);
      const active = visibleRows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]));
      if (active) {
        return active;
      }
      const latest = visibleRows[0];
      if (latest) {
        return latest;
      }
    }

    return this.createWorkflow({
      ...input,
      novelId: input.novelId?.trim() || null,
    });
  }

  async attachNovelToTask(taskId: string, novelId: string, stage: NovelWorkflowStage = "project_setup") {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    const novelTitle = await this.getNovelTitle(novelId);
    return prisma.novelWorkflowTask.update({
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
        resumeTargetJson: stringifyResumeTarget(this.buildResumeTarget({
          taskId,
          novelId,
          lane: existing.lane,
          stage,
        })),
        heartbeatAt: new Date(),
      },
    });
  }

  async markTaskRunning(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
  }) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "running",
        startedAt: existing.startedAt ?? new Date(),
        finishedAt: null,
        heartbeatAt: new Date(),
        currentStage: stageLabel(input.stage),
        currentItemKey: input.itemKey ?? input.stage,
        currentItemLabel: input.itemLabel,
        progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),
        lastError: null,
        cancelRequestedAt: null,
      },
    });
  }

  async markTaskFailed(taskId: string, message: string, patch?: Partial<SyncWorkflowStageInput>) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      return null;
    }
    const stage = patch?.stage ?? "auto_director";
    const resumeTarget = parseResumeTarget(existing.resumeTargetJson) ?? this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage,
      chapterId: patch?.chapterId,
      volumeId: patch?.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
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
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "cancelled",
        cancelRequestedAt: new Date(),
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  }

  async retryTask(taskId: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: existing.checkpointType ? "waiting_approval" : "queued",
        attemptCount: existing.attemptCount + 1,
        lastError: null,
        finishedAt: null,
        cancelRequestedAt: null,
        heartbeatAt: new Date(),
      },
    });
  }

  async continueTask(taskId: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        heartbeatAt: new Date(),
        status: existing.status === "queued" ? "running" : existing.status,
      },
    });
  }

  async requeueTaskForRecovery(taskId: string, message: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "queued",
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
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    const resumeTarget = this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: "auto_director",
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "waiting_approval",
        currentStage: stageLabel("auto_director"),
        currentItemKey: "auto_director",
        currentItemLabel: "等待确认书级方向",
        checkpointType: "candidate_selection_required",
        checkpointSummary: input.summary,
        resumeTargetJson: stringifyResumeTarget(
          existing.novelId
            ? buildNovelEditResumeTarget({
              novelId: existing.novelId,
              taskId,
              stage: "basic",
            })
            : buildNovelCreateResumeTarget(taskId, "director"),
        ),
        progress: Math.max(existing.progress, defaultProgressForStage("auto_director")),
        heartbeatAt: new Date(),
        seedPayloadJson: input.seedPayload
          ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
          : existing.seedPayloadJson,
        milestonesJson: appendMilestone(existing.milestonesJson, "candidate_selection_required", input.summary),
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
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    const resumeTarget = this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
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
    const resumeTarget = this.buildResumeTarget({
      taskId: task.id,
      novelId,
      lane: task.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
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
