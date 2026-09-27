import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { getArchivedTaskIdSet } from "../../../task/taskArchive";
import type { BootstrapWorkflowInput } from "../../workflow/novelWorkflow.helpers";
import {
  defaultProgressForStage,
  mapStageToTab,
  stageLabel,
} from "../../workflow/novelWorkflow.helpers";
import {
  buildNovelEditResumeTarget,
  defaultWorkflowTitle,
  stringifyResumeTarget,
} from "../../workflow/novelWorkflow.shared";
import { getNovelWorkflowLaneDescriptor } from "@ai-novel/shared/types/novelWorkflow";

const ACTIVE_DIRECTOR_TASK_STATUSES = ["queued", "running", "waiting_approval"] as const;
const ACTIVE_DIRECTOR_COMMAND_STATUSES = ["queued", "leased", "running"] as const;
const REPLACED_TASK_MESSAGE = "已被新的 AI 任务替换";

export type StartDirectorTaskInput = Omit<
  BootstrapWorkflowInput,
  "workflowTaskId" | "forceNew" | "lane" | "novelId"
> & {
  novelId: string;
  existingTaskId?: string;
};

export type StartDirectorTaskOptions = {
  whenActive: "reject" | "supersede";
};

async function resolveLatestVisibleDirectorTask(novelId: string, excludeTaskId?: string) {
  const normalizedNovelId = novelId.trim();
  if (!normalizedNovelId) {
    return null;
  }
  const normalizedExcludeTaskId = excludeTaskId?.trim();

  const rows = await prisma.novelWorkflowTask.findMany({
    where: {
      novelId: normalizedNovelId,
      lane: "auto_director",
      ...(normalizedExcludeTaskId ? { id: { not: normalizedExcludeTaskId } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const archivedTaskIds = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
  return rows.find((row) => !archivedTaskIds.has(row.id)) ?? null;
}

export function resolveCurrentDirectorTask(novelId: string) {
  return resolveLatestVisibleDirectorTask(novelId);
}

export function resolvePreviousDirectorTask(novelId: string, excludeTaskId: string) {
  return resolveLatestVisibleDirectorTask(novelId, excludeTaskId);
}

export async function findActiveDirectorTask(novelId: string) {
  const currentTask = await resolveCurrentDirectorTask(novelId);
  return currentTask && ACTIVE_DIRECTOR_TASK_STATUSES.includes(
    currentTask.status as (typeof ACTIVE_DIRECTOR_TASK_STATUSES)[number],
  )
    ? currentTask
    : null;
}

export async function startDirectorTaskForNovel(
  input: StartDirectorTaskInput,
  options: StartDirectorTaskOptions,
) {
  const novelId = input.novelId.trim();
  if (!novelId) {
    throw new AppError("小说编号不能为空。", 400);
  }

  return withSqliteRetry(
    () => prisma.$transaction(async (tx) => {
      const activeTasks = await tx.novelWorkflowTask.findMany({
        where: {
          novelId,
          lane: "auto_director",
          status: { in: [...ACTIVE_DIRECTOR_TASK_STATUSES] },
          ...(input.existingTaskId ? { id: { not: input.existingTaskId } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (activeTasks.length > 0 && options.whenActive === "reject") {
        throw new AppError(
          "这本书已有进行中的 AI 任务，请先继续或取消当前任务。",
          409,
          {
            code: "DIRECTOR_TASK_ALREADY_ACTIVE",
            activeTaskId: activeTasks[0]?.id,
          },
        );
      }

      if (activeTasks.length > 0) {
        const now = new Date();
        const activeTaskIds = activeTasks.map((task) => task.id);
        await tx.novelWorkflowTask.updateMany({
          where: {
            id: { in: activeTaskIds },
            status: { in: [...ACTIVE_DIRECTOR_TASK_STATUSES] },
          },
          data: {
            status: "cancelled",
            finishedAt: now,
            lastError: REPLACED_TASK_MESSAGE,
          },
        });
        await tx.directorRunCommand.updateMany({
          where: {
            taskId: { in: activeTaskIds },
            status: { in: [...ACTIVE_DIRECTOR_COMMAND_STATUSES] },
          },
          data: {
            status: "cancelled",
            finishedAt: now,
            errorMessage: REPLACED_TASK_MESSAGE,
          },
        });
      }

      if (input.existingTaskId) {
        const existingTask = await tx.novelWorkflowTask.findUnique({
          where: { id: input.existingTaskId },
        });
        if (!existingTask) {
          throw new AppError("Workflow task not found.", 404);
        }
        if (existingTask.lane !== "auto_director" || (existingTask.novelId && existingTask.novelId !== novelId)) {
          throw new AppError("Only an unattached auto director task can be linked to this novel.", 409);
        }
        if (existingTask.novelId === novelId) {
          return existingTask;
        }
        return tx.novelWorkflowTask.update({
          where: { id: existingTask.id },
          data: { novelId },
        });
      }

      const initialState = input.initialState;
      const laneDescriptor = getNovelWorkflowLaneDescriptor("auto_director");
      const initialStage = initialState?.stage ?? laneDescriptor.initialStage;
      const initialItemKey = initialState?.itemKey ?? laneDescriptor.initialItemKey;
      const initialItemLabel = initialState?.itemLabel ?? laneDescriptor.initialItemLabel;
      const novel = await tx.novel.findUnique({
        where: { id: novelId },
        select: { title: true },
      });
      const created = await tx.novelWorkflowTask.create({
        data: {
          novelId,
          lane: "auto_director",
          title: defaultWorkflowTitle({
            lane: "auto_director",
            title: input.title,
            novelTitle: novel?.title,
          }),
          status: "queued",
          progress: initialState?.progress ?? defaultProgressForStage(initialStage),
          currentStage: stageLabel(initialStage),
          currentItemKey: initialItemKey,
          currentItemLabel: initialItemLabel,
          seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
        },
      });
      const resumeTarget = buildNovelEditResumeTarget({
        taskId: created.id,
        novelId,
        lane: "auto_director",
        stage: mapStageToTab(initialStage),
        chapterId: initialState?.chapterId,
        volumeId: initialState?.volumeId,
      });
      return tx.novelWorkflowTask.update({
        where: { id: created.id },
        data: { resumeTargetJson: stringifyResumeTarget(resumeTarget) },
      });
    }, { isolationLevel: "Serializable" }),
    { label: "director.startTaskForNovel" },
  );
}
