import { prisma } from "../../db/prisma";
import type { RagJobStatus } from "./types";

const FINISHED_RAG_JOB_STATUSES: RagJobStatus[] = ["succeeded", "failed", "cancelled"];
const ACTIVE_RAG_JOB_STATUSES: RagJobStatus[] = ["queued", "running"];

export class RagJobCleanupService {
  async clearFinishedJobs(): Promise<{ deletedCount: number; activeCount: number }> {
    const [activeCount, deleteResult] = await prisma.$transaction([
      prisma.ragIndexJob.count({
        where: {
          status: {
            in: ACTIVE_RAG_JOB_STATUSES,
          },
        },
      }),
      prisma.ragIndexJob.deleteMany({
        where: {
          status: {
            in: FINISHED_RAG_JOB_STATUSES,
          },
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
      select: { status: true },
    });
    if (!job) {
      throw new Error("RAG job not found.");
    }

    const status = job.status as RagJobStatus;
    if (!FINISHED_RAG_JOB_STATUSES.includes(status)) {
      return {
        deletedCount: 0,
        status,
      };
    }

    await prisma.ragIndexJob.delete({
      where: { id: jobId },
    });
    return {
      deletedCount: 1,
      status,
    };
  }
}
