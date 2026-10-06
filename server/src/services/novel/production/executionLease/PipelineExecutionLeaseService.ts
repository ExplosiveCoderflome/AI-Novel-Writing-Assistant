import { prisma } from "../../../../db/prisma";

type ExecutionLeaseStore = Pick<typeof prisma.generationJob, "updateMany">;

export const PIPELINE_EXECUTION_LEASE_MS = 2 * 60 * 1000;
export const PIPELINE_EXECUTION_RENEW_INTERVAL_MS = 30 * 1000;

export class PipelineExecutionLeaseService {
  constructor(private readonly store: ExecutionLeaseStore = prisma.generationJob) {}

  async claim(input: {
    jobId: string;
    ownerId: string;
    now?: Date;
    leaseMs?: number;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + Math.max(10_000, input.leaseMs ?? PIPELINE_EXECUTION_LEASE_MS));
    const result = await this.store.updateMany({
      where: {
        id: input.jobId,
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
        cancelRequestedAt: null,
        OR: [
          { executionOwner: null },
          { executionLeaseExpiresAt: { lt: now } },
          { executionOwner: input.ownerId },
        ],
      },
      data: {
        executionOwner: input.ownerId,
        executionLeaseExpiresAt: leaseExpiresAt,
      },
    });
    return result.count === 1;
  }

  async renew(input: {
    jobId: string;
    ownerId: string;
    now?: Date;
    leaseMs?: number;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + Math.max(10_000, input.leaseMs ?? PIPELINE_EXECUTION_LEASE_MS));
    const result = await this.store.updateMany({
      where: {
        id: input.jobId,
        executionOwner: input.ownerId,
        executionLeaseExpiresAt: { gt: now, lt: leaseExpiresAt },
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
        cancelRequestedAt: null,
      },
      data: { executionLeaseExpiresAt: leaseExpiresAt },
    });
    return result.count === 1;
  }

  async release(jobId: string, ownerId: string): Promise<boolean> {
    const result = await this.store.updateMany({
      where: { id: jobId, executionOwner: ownerId },
      data: { executionOwner: null, executionLeaseExpiresAt: null },
    });
    return result.count === 1;
  }
}
