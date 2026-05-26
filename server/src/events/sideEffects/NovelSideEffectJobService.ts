import type { NovelSideEffectJob } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  NOVEL_SIDE_EFFECT_PAYLOAD_VERSION,
  type EnqueueNovelSideEffectJobInput,
  type NovelSideEffectJobStatus,
  type NovelSideEffectLeaseOptions,
} from "./NovelSideEffectJobTypes";

const RUNNABLE_STATUSES: NovelSideEffectJobStatus[] = ["pending", "failed"];
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_RETRY_JITTER_MS = 1_000;

type NovelSideEffectDb = Pick<typeof prisma, "novelSideEffectJob">;

export interface NovelSideEffectJobServiceOptions {
  db?: NovelSideEffectDb;
  now?: () => Date;
  random?: () => number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  retryJitterMs?: number;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error || "Novel side effect job failed.");
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function computeNovelSideEffectRetryDelayMs(input: {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
  jitterMs?: number;
  random?: () => number;
}): number {
  const baseMs = input.baseMs ?? DEFAULT_RETRY_BASE_MS;
  const maxMs = input.maxMs ?? DEFAULT_RETRY_MAX_MS;
  const jitterMs = input.jitterMs ?? DEFAULT_RETRY_JITTER_MS;
  const attempt = Math.max(1, input.attempt);
  const exponential = Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.max(0, jitterMs) * Math.max(0, Math.min(1, input.random?.() ?? Math.random())));
  return exponential + jitter;
}

export class NovelSideEffectJobService {
  private readonly db: NovelSideEffectDb;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly retryJitterMs: number;

  constructor(options: NovelSideEffectJobServiceOptions = {}) {
    this.db = options.db ?? prisma;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    this.retryJitterMs = options.retryJitterMs ?? DEFAULT_RETRY_JITTER_MS;
  }

  async enqueueJob(input: EnqueueNovelSideEffectJobInput): Promise<{
    job: NovelSideEffectJob;
    created: boolean;
  }> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new Error("Novel side effect job requires idempotencyKey.");
    }
    const existing = await this.db.novelSideEffectJob.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { job: existing, created: false };
    }
    try {
      const job = await this.db.novelSideEffectJob.create({
        data: {
          novelId: input.novelId ?? null,
          jobType: input.jobType,
          status: "pending",
          idempotencyKey,
          payloadVersion: input.payloadVersion ?? NOVEL_SIDE_EFFECT_PAYLOAD_VERSION,
          payloadJson: JSON.stringify(input.payload),
          attempts: 0,
          maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          runAfter: input.runAfter ?? this.now(),
        },
      });
      return { job, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const job = await this.db.novelSideEffectJob.findUnique({
        where: { idempotencyKey },
      });
      if (!job) {
        throw error;
      }
      return { job, created: false };
    }
  }

  async leaseNext(options: NovelSideEffectLeaseOptions): Promise<NovelSideEffectJob | null> {
    const now = options.now ?? this.now();
    const candidate = await this.db.novelSideEffectJob.findFirst({
      where: {
        status: { in: RUNNABLE_STATUSES },
        runAfter: { lte: now },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) {
      return null;
    }

    const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);
    const claimed = await this.db.novelSideEffectJob.updateMany({
      where: {
        id: candidate.id,
        status: { in: RUNNABLE_STATUSES },
        runAfter: { lte: now },
      },
      data: {
        status: "running",
        leaseOwner: options.workerId,
        leaseExpiresAt,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    return this.db.novelSideEffectJob.findUnique({ where: { id: candidate.id } });
  }

  async markSucceeded(job: NovelSideEffectJob): Promise<void> {
    const updated = await this.db.novelSideEffectJob.updateMany({
      where: {
        id: job.id,
        status: "running",
        leaseOwner: job.leaseOwner,
      },
      data: {
        status: "succeeded",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        finishedAt: this.now(),
      },
    });
    if (updated.count !== 1) {
      throw new Error(`Novel side effect job ${job.id} was not running for this worker.`);
    }
  }

  async markFailedOrDead(job: NovelSideEffectJob, error: unknown, options?: { forceDead?: boolean }): Promise<NovelSideEffectJobStatus> {
    const nextStatus: NovelSideEffectJobStatus = options?.forceDead || job.attempts >= job.maxAttempts ? "dead" : "failed";
    const retryDelayMs = nextStatus === "failed"
      ? computeNovelSideEffectRetryDelayMs({
          attempt: job.attempts,
          baseMs: this.retryBaseMs,
          maxMs: this.retryMaxMs,
          jitterMs: this.retryJitterMs,
          random: this.random,
        })
      : 0;
    const updated = await this.db.novelSideEffectJob.updateMany({
      where: {
        id: job.id,
        status: "running",
        leaseOwner: job.leaseOwner,
      },
      data: {
        status: nextStatus,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: toErrorMessage(error),
        runAfter: nextStatus === "failed" ? new Date(this.now().getTime() + retryDelayMs) : job.runAfter,
        finishedAt: nextStatus === "dead" ? this.now() : null,
      },
    });
    if (updated.count !== 1) {
      throw new Error(`Novel side effect job ${job.id} failed state update was rejected.`);
    }
    return nextStatus;
  }

  async recoverExpiredRunningJobs(now = this.now()): Promise<number> {
    const updated = await this.db.novelSideEffectJob.updateMany({
      where: {
        status: "running",
        leaseExpiresAt: { lt: now },
      },
      data: {
        status: "failed",
        leaseOwner: null,
        leaseExpiresAt: null,
        runAfter: now,
        lastError: "Novel side effect worker restarted or lease expired; job requeued.",
      },
    });
    return updated.count;
  }
}

export const novelSideEffectJobService = new NovelSideEffectJobService();

