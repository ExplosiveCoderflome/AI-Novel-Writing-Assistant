import type { RunExecutor } from "./runExecutor";
import type { DirectorWorkerRuntime, EventLog, RunRepository } from "./ports";
import { FactIntegrityError, type RunContract, type RunControl } from "../domain";

export interface DirectorRecoveryPolicy {
  maxAttempts(contract: RunContract): number;
}

export interface DirectorWorkerDeps {
  runRepository: Pick<RunRepository, "listLeaseCandidates" | "acquireLease" | "heartbeat" | "getContract" | "getControl" | "transition">;
  executor: Pick<RunExecutor, "runOnce">;
  runtime: DirectorWorkerRuntime;
  eventLog?: Pick<EventLog, "list" | "append">;
  recoveryPolicy?: DirectorRecoveryPolicy;
  pollMs?: number;
  heartbeatMs?: number;
  canExecute?: (runId: string) => Promise<boolean>;
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
    const pageSize = this.deps.canExecute ? 100 : 1;
    for (let offset = 0; ; offset += pageSize) {
      const candidates = await this.deps.runRepository.listLeaseCandidates(now, pageSize, this.deps.runtime.workerId(), offset);
      for (const runId of candidates) {
        if (this.deps.canExecute && !await this.deps.canExecute(runId)) continue;
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
          if (this.deps.runRepository.getControl && this.deps.runRepository.transition) {
            const control = await this.deps.runRepository.getControl(runId);
            if (control?.status === "queued") {
              await this.deps.runRepository.transition(runId, { type: "start" }, control.version);
            }
          }
          await this.deps.executor.runOnce(runId);
        } catch (error) {
          if (!this.deps.eventLog || !this.deps.recoveryPolicy) throw error;
          await this.handleExecutionFailure(runId, error);
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
      if (!this.deps.canExecute || candidates.length < pageSize) break;
    }
    return false;
  }

  private async handleExecutionFailure(runId: string, error: unknown): Promise<void> {
    const [contract, control, events] = await Promise.all([
      this.deps.runRepository.getContract(runId),
      this.deps.runRepository.getControl(runId),
      this.deps.eventLog?.list(runId),
    ]);
    if (!contract || !control || !events || !this.deps.eventLog || !this.deps.recoveryPolicy) {
      throw error;
    }
    if (control.status !== "running") return;
    if (error instanceof FactIntegrityError) {
      const reason = error.message;
      await this.deps.eventLog.append({
        runId,
        type: "stop_signal",
        payload: { kind: "data_integrity", reason, action: "pause_for_manual", source: "runtime" },
      });
      await this.deps.runRepository.transition(runId, {
        type: "pause",
        pause: { kind: "safety", reason },
      }, control.version);
      return;
    }
    const resumedAt = events.filter(event => event.type === "stop_signal_cleared").at(-1)?.seq ?? 0;
    const failures = events.filter((event) => event.type === "execution_failure" && (!resumedAt || event.seq > resumedAt)).length;
    await this.deps.eventLog.append({
      runId,
      type: "execution_failure",
      payload: { attempt: failures + 1, controlVersion: control.version, message: error instanceof Error ? error.message : "unknown execution failure" },
    });
    const maxAttempts = Math.max(0, Math.floor(this.deps.recoveryPolicy.maxAttempts(contract)));
    if (failures + 1 <= maxAttempts) return;
    const reason = "execution_retry_budget_exhausted";
    await this.deps.eventLog.append({
      runId,
      type: "stop_signal",
      payload: { kind: "manual_recovery", reason, action: "pause_for_manual", source: "runtime" },
    });
    await this.deps.runRepository.transition(runId, {
      type: "pause",
      pause: { kind: "manual_recovery", reason },
    }, control.version);
  }

  async start(): Promise<void> {
    const pollMs = this.deps.pollMs ?? 1_000;
    while (!this.stopped) {
      const didWork = await this.tick();
      if (!didWork) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
