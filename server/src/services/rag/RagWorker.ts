import { ragConfig } from "../../config/rag";
import { RagIndexService } from "./RagIndexService";

function backoffMs(attempt: number): number {
  const factor = Math.min(Math.max(attempt, 1), 6);
  return ragConfig.workerRetryBaseMs * (2 ** (factor - 1));
}

export class RagWorker {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(private readonly ragIndexService: RagIndexService) {}

  start(): void {
    if (!ragConfig.enabled || this.timer) {
      return;
    }
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
      await this.ragIndexService.updateJobStatus(job.id, {
        status: "running",
        attempts: nextAttempt,
        lastError: null,
      });

      try {
        await this.ragIndexService.processJob(job);
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "succeeded",
          lastError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "RAG 索引任务失败。";
        if (nextAttempt >= job.maxAttempts) {
          await this.ragIndexService.updateJobStatus(job.id, {
            status: "failed",
            attempts: nextAttempt,
            lastError: message,
          });
          return;
        }
        await this.ragIndexService.updateJobStatus(job.id, {
          status: "queued",
          attempts: nextAttempt,
          runAfter: new Date(Date.now() + backoffMs(nextAttempt)),
          lastError: message,
        });
      }
    } finally {
      this.isTicking = false;
    }
  }
}
