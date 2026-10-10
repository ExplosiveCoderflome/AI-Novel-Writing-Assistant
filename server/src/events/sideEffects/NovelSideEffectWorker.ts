import os from "node:os";
import { NovelSideEffectJobService, novelSideEffectJobService, NovelSideEffectLeaseLostError } from "./NovelSideEffectJobService";
import {
  NovelSideEffectJobHandlers,
  UnsupportedNovelSideEffectPayloadError,
} from "./NovelSideEffectJobHandlers";

function resolveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface NovelSideEffectWorkerOptions {
  workerId?: string;
  leaseMs?: number;
  pollMs?: number;
}

export class NovelSideEffectWorker {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly pollMs: number;

  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(
    private readonly jobService: NovelSideEffectJobService = novelSideEffectJobService,
    private readonly handlers: NovelSideEffectJobHandlers = new NovelSideEffectJobHandlers(),
    options: NovelSideEffectWorkerOptions = {},
  ) {
    this.workerId = options.workerId
      ?? process.env.NOVEL_SIDE_EFFECT_WORKER_ID?.trim()
      ?? `novel-side-effect-${os.hostname()}-${process.pid}`;
    this.leaseMs = resolveNumberEnv("NOVEL_SIDE_EFFECT_WORKER_LEASE_MS", options.leaseMs ?? 120_000);
    this.pollMs = resolveNumberEnv("NOVEL_SIDE_EFFECT_WORKER_POLL_MS", options.pollMs ?? 5_000);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    void this.jobService.recoverExpiredRunningJobs().catch((error) => {
      console.warn("[novel-side-effect-worker] failed to recover expired jobs", error);
    });
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollMs);
    void this.tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.isTicking) {
      return;
    }
    this.isTicking = true;
    try {
      const job = await this.jobService.leaseNext({
        workerId: this.workerId,
        leaseMs: this.leaseMs,
      });
      if (!job) {
        return;
      }
      let leaseLost = false;
      // V2 enrichment can include several bounded calls; retain one owner for the whole job.
      const heartbeat = job.jobType === "character.v2DeferredEnrichment" ? setInterval(() => {
        void this.jobService.renewLease(job, this.leaseMs).then(owned => {
          if (!owned) leaseLost = true;
        }).catch(() => {leaseLost = true;});
      }, Math.max(250, Math.floor(this.leaseMs / 3))) : undefined;
      heartbeat?.unref();
      try {
        const result = await this.handlers.execute(job);
        if (leaseLost) return;
        if (result?.deferUntil) await this.jobService.deferJob(job, result.deferUntil);
        else await this.jobService.markSucceeded(job);
      } catch (error) {
        if (leaseLost || error instanceof NovelSideEffectLeaseLostError) return;
        const forceDead = error instanceof UnsupportedNovelSideEffectPayloadError;
        await this.jobService.markFailedOrDead(job, error, { forceDead });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }
    } finally {
      this.isTicking = false;
    }
  }
}

export const novelSideEffectWorker = new NovelSideEffectWorker();

