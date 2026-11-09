import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { canExecuteLegacyTask } from "../../../../../modules/novel/director-routing";
import { parsePipelinePayload } from "../../../pipelineJobState";
import { DirectorTaskStateWriter } from "../../state/DirectorTaskStateWriter";

const message = "已按你的要求暂停，请从本书任务继续。";

/** A source-page pause sets both existing recovery locks in one transaction. */
export async function pauseLegacyDirectorTask(taskId: string, deps = {
  db: prisma as Pick<PrismaClient, "$transaction">,
  writer: new DirectorTaskStateWriter(),
  canExecute: canExecuteLegacyTask,
}): Promise<void> {
  await deps.db.$transaction(async tx => {
    const task = await tx.novelWorkflowTask.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError("找不到这项任务。", 404);
    if (task.lane !== "auto_director" || !task.novelId || !await deps.canExecute(taskId, tx)) throw new AppError("请从本书对应的导演台处理任务。", 409);
    if (task.pendingManualRecovery) return;
    if (task.status !== "running" && task.status !== "queued") throw new AppError("只有进行中或排队中的任务可以暂停。", 409);
    const changed = await deps.writer.updateRunState({ where: { id: taskId, status: { in: ["running", "queued"] }, pendingManualRecovery: false },
      data: { status: "queued", pendingManualRecovery: true, lastError: message, heartbeatAt: null } }, { many: true, transaction: tx });
    if (changed.count !== 1) throw new AppError("任务状态已变化，请重新读取后操作。", 409);
    const jobs = await tx.generationJob.findMany({ where: { novelId: task.novelId, status: { in: ["queued", "running"] } } });
    for (const job of jobs) {
      if (parsePipelinePayload(job.payload).workflowTaskId !== taskId) continue;
      await tx.generationJob.updateMany({ where: { id: job.id, status: { in: ["queued", "running"] } }, data: { pendingManualRecovery: true } });
    }
  });
}
