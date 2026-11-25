import type { Prisma } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

export async function lockNovelForCharacterEdit(db: Prisma.TransactionClient, novelId: string) {
  // Director opening, retry and recovery acquire the same novel row.
  const acquired = await db.novel.updateMany({ where: { id: novelId }, data: { directorEpoch: { increment: 0 } } });
  if (acquired.count !== 1) throw new AppError("找不到这本小说。", 404);
}

const busy = "请在当前创作步骤保存并暂停后再调整角色。";
const recovery = "请先处理当前正文批次，再调整角色。";
const activeStatuses = ["queued", "running", "waiting_gate", "paused"];

export async function readCharacterEditBoundary(db: Prisma.TransactionClient, novelId: string, lock: boolean) {
  const run = await db.directorNextRunControl.findFirst({
    where: { novelId, status: { in: activeStatuses } },
    select: { runId: true, status: true, version: true, cursorStepId: true, leaseOwner: true, leaseExpiresAt: true },
  });
  const isIdle = [{ leaseOwner: null }, { leaseExpiresAt: { lt: new Date() } }];
  if (run && (run.status === "queued" || run.status === "running" || run.cursorStepId
    || (run.leaseOwner && (!run.leaseExpiresAt || run.leaseExpiresAt >= new Date())))) {
    return { run, reason: busy };
  }
  if (run && lock) {
    const result = await db.directorNextRunControl.updateMany({
      where: { runId: run.runId, status: run.status, version: run.version, cursorStepId: null, OR: isIdle },
      data: { version: { increment: 0 } },
    });
    if (result.count !== 1) throw new AppError("创作进度或角色资料有变化，请重新预览后保存。", 409);
  }
  const otherJob = await db.generationJob.findFirst({
    where: { novelId, OR: [{ pendingManualRecovery: true }, { status: { in: ["queued", "running"] } }] },
    select: { id: true },
  });
  if (otherJob) return { run, reason: recovery };
  if (run) {
    const batch = await db.directorNextEvent.findFirst({
      where: { runId: run.runId, type: "chapter_batch_job" }, orderBy: { seq: "desc" }, select: { payloadJson: true },
    });
    if (batch) {
      const binding: { jobId?: string } | null = JSON.parse(batch.payloadJson);
      const job = binding?.jobId ? await db.generationJob.findFirst({
        where: { id: binding.jobId, novelId }, select: { status: true, pendingManualRecovery: true },
      }) : null;
      if (job?.status !== "succeeded" || job.pendingManualRecovery) return { run, reason: recovery };
    }
  }
  return { run, reason: null };
}
