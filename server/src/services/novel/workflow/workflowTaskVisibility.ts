import type { NovelWorkflowLane } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import { getArchivedTaskIdSet, isTaskArchived } from "../../task/taskArchive";
import { isStaleAutoDirectorRunningTask } from "./autoDirectorStaleTaskRecovery";

export async function getVisibleRowsByNovelIdRaw(novelId: string, lane?: NovelWorkflowLane) {
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

export async function getVisibleRowByIdRaw(taskId: string) {
  if (await isTaskArchived("novel_workflow", taskId)) {
    return null;
  }
  return prisma.novelWorkflowTask.findUnique({
    where: { id: taskId },
  });
}

export async function listRecoverableAutoDirectorTasks(options: {
  includeStaleRunningFlag?: boolean;
} = {}) {
  const rows = await prisma.novelWorkflowTask.findMany({
    where: {
      lane: "auto_director",
      status: {
        in: ["queued", "running"],
      },
      pendingManualRecovery: false,
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      lane: true,
      currentItemKey: true,
      pendingManualRecovery: true,
      cancelRequestedAt: true,
      heartbeatAt: true,
      updatedAt: true,
    },
  });
  const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
  return rows
    .filter((row) => !archived.has(row.id))
    .map((row) => ({
      id: row.id,
      status: row.status,
      ...(options.includeStaleRunningFlag
        ? { stale: isStaleAutoDirectorRunningTask(row) }
        : {}),
    }));
}
