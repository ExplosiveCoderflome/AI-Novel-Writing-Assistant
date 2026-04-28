import type { TaskKind } from "@ai-novel/shared/types/task";
import { prisma } from "../../db/prisma";

export async function archiveTask(taskKind: TaskKind, taskId: string): Promise<void> {
  await prisma.taskCenterArchive.upsert({
    where: {
      taskKind_taskId: {
        taskKind,
        taskId,
      },
    },
    create: {
      taskKind,
      taskId,
    },
    update: {
      archivedAt: new Date(),
    },
  });
}

export async function isTaskArchived(taskKind: TaskKind, taskId: string): Promise<boolean> {
  const row = await prisma.taskCenterArchive.findUnique({
    where: {
      taskKind_taskId: {
        taskKind,
        taskId,
      },
    },
    select: {
      id: true,
    },
  });
  return Boolean(row);
}

export async function getArchivedTaskIds(taskKind: TaskKind): Promise<string[]> {
  const rows = await prisma.taskCenterArchive.findMany({
    where: {
      taskKind,
    },
    select: {
      taskId: true,
    },
  });
  return rows.map((row) => row.taskId);
}

export async function getArchivedTaskIdsByKind(taskKinds: TaskKind[]): Promise<Map<TaskKind, string[]>> {
  const uniqueTaskKinds = Array.from(new Set(taskKinds));
  const result = new Map<TaskKind, string[]>(uniqueTaskKinds.map((taskKind) => [taskKind, []]));
  if (uniqueTaskKinds.length === 0) {
    return result;
  }

  const rows = await prisma.taskCenterArchive.findMany({
    where: {
      taskKind: {
        in: uniqueTaskKinds,
      },
    },
    select: {
      taskKind: true,
      taskId: true,
    },
  });

  for (const row of rows) {
    const bucket = result.get(row.taskKind as TaskKind);
    if (bucket) {
      bucket.push(row.taskId);
    }
  }
  return result;
}

export async function getArchivedTaskIdSet(taskKind: TaskKind, taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) {
    return new Set<string>();
  }

  const rows = await prisma.taskCenterArchive.findMany({
    where: {
      taskKind,
      taskId: {
        in: taskIds,
      },
    },
    select: {
      taskId: true,
    },
  });
  return new Set(rows.map((row) => row.taskId));
}
