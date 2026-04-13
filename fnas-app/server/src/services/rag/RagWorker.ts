import { ragConfig } from "../../config/rag";
import { RagIndexService, RagJobCancelledError } from "./RagIndexService";

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
    if (!ragConfig.verboseLog) {
      return;
    }
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
    void this.requeueInterruptedJobs();
    this.timer = setInterval(() => {
      void this.tick();
    }, ragConfig.workerPollMs);
    void this.tick();
  }

  private async requeueInterruptedJobs(): Promise<void> {
    while (true) {
      const runningJobs = await this.ragIndexService.listJobs(500, "running");
      if (runningJobs.length === 0) {
        return;
      }
      this.logWarn("Requeue interrupted running jobs after restart.", {
        count: runningJobs.length,
      });
      await Promise.all(
        runningJobs.map((job) =>
          this.ragIndexService.updateJobStatus(job.id, {
            status: "queued",
            runAfter: new Date(),
            lastError: job.lastError ?? "RAG worker restarted; interrupted job requeued.",
          })
        ),
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
      const job = await this.ragIndexService.getNextRunnableJob();
      if (!job) {
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
      await this.ragIndexService.updateJobStatus(job.id, {
        status: "running",
        attempts: nextAttempt,
        lastError: null,
      });

      try {
        const result = await this.ragIndexService.processJob(job);
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "succeeded",
          lastError: null,
        });
        this.logInfo("Job succeeded.", {
          jobId: job.id,
          chunks: result.chunks,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (error instanceof RagJobCancelledError) {
          this.logInfo("Job cancelled.", {
            jobId: job.id,
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }
        const message = error instanceof Error ? error.message : "RAG 索引任务失败。";
        if (nextAttempt >= job.maxAttempts) {
          await this.ragIndexService.updateJobStatus(job.id, {
            status: "failed",
            attempts: nextAttempt,
            lastError: message,
          });
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
        });
        this.logWarn("Job failed and requeued.", {
          jobId: job.id,
          attempt: nextAttempt,
          nextRetryInMs: delayMs,
          elapsedMs: Date.now() - startedAt,
          error: message,
        });
      }
    } finally {
      this.isTicking = false;
    }
  }
}
