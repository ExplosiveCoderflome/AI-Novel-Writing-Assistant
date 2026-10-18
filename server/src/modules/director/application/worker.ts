import type { RunExecutor } from "./runExecutor";
import type { DirectorWorkerRuntime, EventLog, RunRepository } from "./ports";
import { FactIntegrityError, type RunContract, type RunControl } from "../domain";
import { executionRecoveryFailures } from "./runtime";
import {RunLeaseSession} from "./execution";

export interface DirectorWorkerHealth {
  state: "stopped" | "idle" | "working" | "retrying";
  activeRunId: string | null;
  lastPollAt: Date | null;
}

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
  onError?: (error: unknown) => void;
  executionScope?: <T>(signal: AbortSignal, work: () => Promise<T>) => Promise<T>;
}

export class DirectorWorker {
  private stopped = false;
  private running?: Promise<void>;
  private wakeWait?: () => void;
  private session?: RunLeaseSession;
  private health: DirectorWorkerHealth = {state: "stopped", activeRunId: null, lastPollAt: null};

  constructor(private readonly deps: DirectorWorkerDeps) {}

  stop(): void {
    this.stopped = true;
    this.session?.cancel();
    this.wakeWait?.();
  }

  getHealth(): DirectorWorkerHealth {return {...this.health};}

  wake(): void {
    if (this.stopped) return;
    this.wakeWait?.();
    void this.start().catch(error => this.report(error));
  }

  private report(error: unknown): void {
    this.health.state = "retrying";
    try {(this.deps.onError ?? (error => console.error("[director-next.worker] execution deferred", error)))(error);}
    catch { /* A logging adapter cannot stop the worker. */ }
  }

  private async inScope<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const result = await (this.deps.executionScope ? this.deps.executionScope(signal, work) : work());
    signal.throwIfAborted();
    return result;
  }

  async tick(): Promise<boolean> {
    if (this.stopped) return false;
    this.health = {state: "idle", activeRunId: null, lastPollAt: this.deps.runtime.now()};
    const now = this.deps.runtime.now();
    const pageSize = this.deps.canExecute ? 100 : 1;
    for (let offset = 0; ; offset += pageSize) {
      const candidates = await this.deps.runRepository.listLeaseCandidates(now, pageSize, undefined, offset);
      for (const runId of candidates) {
        let acquired: boolean;
        const owner = `${this.deps.runtime.workerId()}:${this.deps.runtime.nextId()}`;
        let expiresAt: Date;
        try {
          if (this.deps.canExecute && !await this.deps.canExecute(runId)) continue;
          if (this.stopped) return false;
          const claimedAt = this.deps.runtime.now();
          expiresAt = this.deps.runtime.leaseExpiresAt(claimedAt);
          acquired = await this.deps.runRepository.acquireLease(
            runId,
            owner,
            expiresAt,
            claimedAt,
          );
        } catch (error) {this.report(error); continue;}
        if (!acquired) continue;
        this.health.state = "working";
        this.health.activeRunId = runId;
        const session = this.session = new RunLeaseSession({runId, owner, runtime: this.deps.runtime,
          repository: this.deps.runRepository, expiresAt,
          heartbeatMs: this.deps.heartbeatMs ?? 10_000, onError: error => this.report(error)});
        if (this.stopped) session.cancel();
        try {
          await this.inScope(session.signal, async () => {
            if (this.deps.runRepository.getControl && this.deps.runRepository.transition) {
              const control = await this.deps.runRepository.getControl(runId);
              if (control?.status === "queued") {
                await this.deps.runRepository.transition(runId, { type: "start" }, control.version);
              }
            }
            session.signal.throwIfAborted();
            await this.deps.executor.runOnce(runId);
            session.signal.throwIfAborted();
          });
        } catch (error) {
          if (!session.signal.aborted) {
            if (!this.deps.eventLog || !this.deps.recoveryPolicy) throw error;
            await this.inScope(session.signal, () => this.handleExecutionFailure(runId, error));
          }
        } finally {
          await session.close();
          this.session = undefined;
          this.health.activeRunId = null;
          const repo = this.deps.runRepository as DirectorWorkerDeps["runRepository"] & Partial<Pick<RunRepository, "releaseLease">>;
          await repo.releaseLease?.(runId, owner);
          if (this.getHealth().state !== "retrying") this.health.state = "idle";
        }
        return !session.interrupted;
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
    const stepId = control.cursorStepId ?? null;
    const failures = executionRecoveryFailures(events, stepId).length;
    await this.deps.eventLog.append({
      runId,
      type: "execution_failure",
      payload: { attempt: failures + 1, controlVersion: control.version, stepId, message: error instanceof Error ? error.message : "unknown execution failure" },
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

  start(): Promise<void> {
    if (this.running) return this.running;
    this.stopped = false;
    this.running = this.loop().finally(() => {this.running = undefined; this.health.state = "stopped";});
    return this.running;
  }

  private async loop(): Promise<void> {
    let failures = 0;
    const pollMs = Math.max(1, this.deps.pollMs ?? 1_000);
    while (!this.stopped) {
      let didWork = false;
      try {didWork = await this.tick();} catch (error) {this.report(error);}
      failures = this.health.state === "retrying" ? Math.min(failures + 1, 5) : 0;
      if (!this.stopped && !didWork) await new Promise<void>(resolve => {
        const timer = setTimeout(() => {this.wakeWait = undefined; resolve();}, Math.min(30_000, pollMs * 2 ** failures));
        this.wakeWait = () => {clearTimeout(timer); this.wakeWait = undefined; resolve();};
      });
    }
  }
}
