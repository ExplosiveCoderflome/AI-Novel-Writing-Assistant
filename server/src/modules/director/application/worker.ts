import type { RunExecutor } from "./runExecutor";
import type { DirectorWorkerRuntime, RunRepository } from "./ports";

export interface DirectorWorkerDeps {
  runRepository: Pick<RunRepository, "listLeaseCandidates" | "acquireLease" | "heartbeat">;
  executor: Pick<RunExecutor, "runOnce">;
  runtime: DirectorWorkerRuntime;
  pollMs?: number;
  heartbeatMs?: number;
}

export class DirectorWorker {
  private stopped = false;

  constructor(private readonly deps: DirectorWorkerDeps) {}

  stop(): void {
    this.stopped = true;
  }

  async tick(): Promise<boolean> {
    if (this.stopped) return false;
    const now = this.deps.runtime.now();
    const candidates = await this.deps.runRepository.listLeaseCandidates(now, 1);
    for (const runId of candidates) {
      const acquired = await this.deps.runRepository.acquireLease(
        runId,
        this.deps.runtime.workerId(),
        this.deps.runtime.leaseExpiresAt(now),
        now,
      );
      if (!acquired) continue;
      const renewal = setInterval(() => {
        void this.deps.runRepository.heartbeat(
          runId,
          this.deps.runtime.workerId(),
          this.deps.runtime.leaseExpiresAt(this.deps.runtime.now()),
          this.deps.runtime.now(),
        );
      }, this.deps.heartbeatMs ?? 10_000);
      renewal.unref();
      try {
        await this.deps.executor.runOnce(runId);
      } finally {
        clearInterval(renewal);
      }
      await this.deps.runRepository.heartbeat(
        runId,
        this.deps.runtime.workerId(),
        this.deps.runtime.leaseExpiresAt(this.deps.runtime.now()),
        this.deps.runtime.now(),
      );
      return true;
    }
    return false;
  }

  async start(): Promise<void> {
    const pollMs = this.deps.pollMs ?? 1_000;
    while (!this.stopped) {
      const didWork = await this.tick();
      if (!didWork) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
