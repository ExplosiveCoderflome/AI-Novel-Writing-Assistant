import { ragConfig } from "../../config/rag";
import { RagIndexService, RagJobCancelledError } from "./RagIndexService";
import { RagLeaseLostError, RagIndexRollbackError, RAG_LEASE_HEARTBEAT_MS } from "./indexing";

function backoffMs(attempt: number): number {
  const factor = Math.min(Math.max(attempt, 1), 6);
  return ragConfig.workerRetryBaseMs * (2 ** (factor - 1));
}

export class RagWorker {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(private readonly ragIndexService: RagIndexService) {}

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    if (!ragConfig.verboseLog) {
      return;
    }
    if (meta) {
      console.info(`[RAG][Worker] ${message}`, meta);
      return;
    }
    console.info(`[RAG][Worker] ${message}`);
  }

  private logWarn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(`[RAG][Worker] ${message}`, meta);
      return;
    }
    console.warn(`[RAG][Worker] ${message}`);
  }

  start(): void {
    if (!ragConfig.enabled || this.timer) {
      return;
    }
    this.logInfo("Worker started.", {
      pollMs: ragConfig.workerPollMs,
      maxAttempts: ragConfig.workerMaxAttempts,
      retryBaseMs: ragConfig.workerRetryBaseMs,
    });
    // Recovery completes before the first poll. Settings stop/start must not requeue
    // a request still running in this same worker instance.
    this.timer = setInterval(() => {
      void this.tick();
    }, ragConfig.workerPollMs);
    void this.tick();
  }

  private async requeueInterruptedJobs(): Promise<void> {
    while (true) {
      const runningJobs = await this.ragIndexService.listInterruptedJobs();
      if (runningJobs.length === 0) {
        return;
      }
      this.logWarn("Requeue interrupted running jobs after restart.", {
        count: runningJobs.length,
      });
      await Promise.all(
        runningJobs.map((job) => this.ragIndexService.recoverJob(job)),
      );
    }
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
    this.logInfo("Worker stopped.");
  }

  private async tick(): Promise<void> {
    if (this.isTicking) {
      return;
    }
    this.isTicking = true;
    try {
      await this.requeueInterruptedJobs();
      if (!this.timer || !ragConfig.enabled) return;
      const job = await this.ragIndexService.getNextRunnableJob();
      if (!job) {
        return;
      }
      if (job.attempts >= job.maxAttempts) {
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "failed", lastError: job.lastError ?? "RAG job exhausted its attempt limit.",
        });
        return;
      }

      const nextAttempt = job.attempts + 1;
      const startedAt = Date.now();
      this.logInfo("Job picked.", {
        jobId: job.id,
        jobType: job.jobType,
        ownerType: job.ownerType,
        ownerId: job.ownerId,
        tenantId: job.tenantId,
        attempt: nextAttempt,
        maxAttempts: job.maxAttempts,
      });
      const claimed = await this.ragIndexService.claimJob(job);
      if (!claimed) return;
      const heartbeat = setInterval(() => {
        void this.ragIndexService.renewJob(claimed).catch((error: unknown) => {
          this.logWarn("Lease heartbeat failed.", { jobId: job.id, error: error instanceof Error ? error.message : "Unknown heartbeat error." });
        });
      }, RAG_LEASE_HEARTBEAT_MS);
      heartbeat.unref?.();

      try {
        const result = await this.ragIndexService.processJob(claimed);
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "succeeded",
          lastError: null,
        }, claimed);
        this.logInfo("Job succeeded.", {
          jobId: job.id,
          chunks: result.chunks,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (error instanceof RagJobCancelledError || error instanceof RagLeaseLostError) {
          this.logInfo("Job cancelled.", {
            jobId: job.id,
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }
        const message = error instanceof Error ? error.message : "RAG 索引任务失败。";
        if (nextAttempt >= job.maxAttempts || error instanceof RagIndexRollbackError) {
          await this.ragIndexService.updateJobStatus(job.id, {
            status: "failed",
            attempts: nextAttempt,
            lastError: message,
          }, claimed);
          this.logWarn("Job failed permanently.", {
            jobId: job.id,
            attempt: nextAttempt,
            maxAttempts: job.maxAttempts,
            elapsedMs: Date.now() - startedAt,
            error: message,
          });
          return;
        }
        const delayMs = backoffMs(nextAttempt);
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "queued",
          attempts: nextAttempt,
          runAfter: new Date(Date.now() + delayMs),
          lastError: message,
        }, claimed);
        this.logWarn("Job failed and requeued.", {
          jobId: job.id,
          attempt: nextAttempt,
          nextRetryInMs: delayMs,
          elapsedMs: Date.now() - startedAt,
          error: message,
        });
      } finally { clearInterval(heartbeat); }
    } catch (error) {
      this.logWarn("Worker poll failed.", { error: error instanceof Error ? error.message : "Unknown worker error." });
    } finally {
      this.isTicking = false;
    }
  }
}
