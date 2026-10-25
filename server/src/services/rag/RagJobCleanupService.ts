import { prisma } from "../../db/prisma";
import type { RagJobStatus } from "./types";
import { hasPendingIndexReplacement } from "./indexing";

const FINISHED_RAG_JOB_STATUSES: RagJobStatus[] = ["succeeded", "failed", "cancelled"];
const ACTIVE_RAG_JOB_STATUSES: RagJobStatus[] = ["queued", "running"];

export class RagJobCleanupService {
  async clearFinishedJobs(): Promise<{ deletedCount: number; activeCount: number }> {
    const records = await prisma.ragIndexJob.findMany({ where: { ownerType: "knowledge_document",
      status: { in: FINISHED_RAG_JOB_STATUSES } }, select: { id: true, payloadJson: true, updatedAt: true } });
    const protectedIds = records.filter((row) => hasPendingIndexReplacement(row.payloadJson)).map((row) => row.id);
    const deletableKnowledge = records.filter((row) => !hasPendingIndexReplacement(row.payloadJson));
    const [activeCount, deleteResult] = await prisma.$transaction([
      prisma.ragIndexJob.count({
        where: {
          ...(protectedIds.length ? { OR: [{ status: { in: ACTIVE_RAG_JOB_STATUSES } }, { id: { in: protectedIds } }] }
            : { status: { in: ACTIVE_RAG_JOB_STATUSES } }),
        },
      }),
      prisma.ragIndexJob.deleteMany({
        where: {
          status: {
            in: FINISHED_RAG_JOB_STATUSES,
          },
          OR: [
            { ownerType: { not: "knowledge_document" } },
            ...deletableKnowledge.map((row) => ({ id: row.id, payloadJson: row.payloadJson, updatedAt: row.updatedAt })),
          ],
        },
      }),
    ]);

    return {
      deletedCount: deleteResult.count,
      activeCount,
    };
  }

  async deleteFinishedJob(jobId: string): Promise<{ deletedCount: number; status: RagJobStatus }> {
    const job = await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { status: true, payloadJson: true, updatedAt: true },
    });
    if (!job) {
      throw new Error("RAG job not found.");
    }

    const status = job.status as RagJobStatus;
    if (!FINISHED_RAG_JOB_STATUSES.includes(status) || hasPendingIndexReplacement(job.payloadJson)) {
      return {
        deletedCount: 0,
        status,
      };
    }

    const result = await prisma.ragIndexJob.deleteMany({
      where: { id: jobId, status: job.status, payloadJson: job.payloadJson, updatedAt: job.updatedAt },
    });
    return {
      deletedCount: result.count,
      status,
    };
  }
}
