import type {
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  defaultWorkflowTitle,
  mergeSeedPayload,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";
import {
  ACTIVE_STATUSES,
  AutoDirectorNovelCreationClaim,
  BootstrapWorkflowInput,
  defaultProgressForStage,
  isPreNovelAutoDirectorCandidateTask,
  stageLabel,
  SyncWorkflowStageInput,
} from "./novelWorkflowServiceSupport";

export interface WorkflowLifecycleDeps {
  getNovelTitle(novelId: string): Promise<string | null>;
  getVisibleRowById(taskId: string): Promise<any>;
  getVisibleRowByIdRaw(taskId: string): Promise<any>;
  getVisibleRowsByNovelId(novelId: string, lane?: NovelWorkflowLane): Promise<any[]>;
  buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget;
  updateTaskWithRetry(args: Parameters<typeof prisma.novelWorkflowTask.update>[0]): Promise<any>;
  updateTaskManyWithRetry(args: Parameters<typeof prisma.novelWorkflowTask.updateMany>[0]): Promise<{ count: number }>;
  bootstrapTask(input: BootstrapWorkflowInput): Promise<any>;
  attachNovelToTask(taskId: string, novelId: string, stage?: NovelWorkflowStage): Promise<any>;
}

export async function createWorkflow(
  deps: WorkflowLifecycleDeps,
  input: BootstrapWorkflowInput,
) {
  const novelTitle = input.novelId ? await deps.getNovelTitle(input.novelId) : null;
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
        deps.buildResumeTarget({
          taskId: "",
          novelId: input.novelId ?? null,
          lane: input.lane,
          stage: input.lane === "auto_director" ? "auto_director" : "project_setup",
        }),
      ),
      seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
    },
  });
  const resumeTarget = deps.buildResumeTarget({
    taskId: created.id,
    novelId: created.novelId,
    lane: created.lane,
    stage: created.lane === "auto_director" ? "auto_director" : "project_setup",
  });
  return deps.updateTaskWithRetry({
    where: { id: created.id },
    data: {
      resumeTargetJson: stringifyResumeTarget(resumeTarget),
    },
  });
}

export async function bootstrapTask(
  deps: WorkflowLifecycleDeps,
  input: BootstrapWorkflowInput,
) {
  if (input.workflowTaskId?.trim()) {
    const existing = await deps.getVisibleRowById(input.workflowTaskId.trim());
    if (existing) {
      if (input.novelId?.trim() && existing.novelId !== input.novelId.trim()) {
        if (isPreNovelAutoDirectorCandidateTask(existing)) {
          return existing;
        }
        const attached = await deps.attachNovelToTask(existing.id, input.novelId.trim());
        if (input.seedPayload) {
          return deps.updateTaskWithRetry({
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
        return deps.updateTaskWithRetry({
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
    const visibleRows = await deps.getVisibleRowsByNovelId(input.novelId.trim(), input.lane);
    const active = visibleRows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]));
    if (active) {
      return active;
    }
    const latest = visibleRows[0];
    if (latest) {
      return latest;
    }
  }

  return createWorkflow(deps, {
    ...input,
    novelId: input.novelId?.trim() || null,
  });
}

export async function attachNovelToTask(
  deps: WorkflowLifecycleDeps,
  taskId: string,
  novelId: string,
  stage: NovelWorkflowStage = "project_setup",
) {
  const existing = await deps.getVisibleRowById(taskId);
  if (!existing) {
    throw new AppError("Workflow task not found.", 404);
  }
  const novelTitle = await deps.getNovelTitle(novelId);
  return deps.updateTaskWithRetry({
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
      resumeTargetJson: stringifyResumeTarget(deps.buildResumeTarget({
        taskId,
        novelId,
        lane: existing.lane,
        stage,
      })),
      heartbeatAt: new Date(),
    },
  });
}

export async function claimAutoDirectorNovelCreation(
  deps: WorkflowLifecycleDeps,
  taskId: string,
  input: {
    itemLabel: string;
    progress: number;
  },
): Promise<AutoDirectorNovelCreationClaim> {
  const existing = await deps.getVisibleRowByIdRaw(taskId);
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
  const claimed = await deps.updateTaskManyWithRetry({
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

  const latest = await deps.getVisibleRowByIdRaw(taskId);
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

export async function syncStageByNovelId(
  deps: WorkflowLifecycleDeps,
  novelId: string,
  input: SyncWorkflowStageInput,
) {
  const task = await deps.bootstrapTask({
    novelId,
    lane: "manual_create",
  });
  const resumeTarget = deps.buildResumeTarget({
    taskId: task.id,
    novelId,
    lane: task.lane,
    stage: input.stage,
    chapterId: input.chapterId,
    volumeId: input.volumeId,
  });
  return deps.updateTaskWithRetry({
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
