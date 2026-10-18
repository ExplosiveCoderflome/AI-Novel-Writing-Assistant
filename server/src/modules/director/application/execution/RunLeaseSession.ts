import type {DirectorWorkerRuntime, RunRepository} from "../ports";

export class RunLeaseLostError extends Error {
  constructor() {super("本次执行的租约已失效，已停止旧执行。"); this.name = "RunLeaseLostError";}
}

/** Serial renewal and a separate expiry deadline; no detached rejected promises. */
export class RunLeaseSession {
  private readonly controller = new AbortController();
  private renewal?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private closed = false;
  private lost = false;
  readonly signal = this.controller.signal;
  get interrupted(): boolean {return this.lost;}

  constructor(private readonly input: {
    runId: string; owner: string; runtime: DirectorWorkerRuntime;
    repository: Pick<RunRepository, "heartbeat">; heartbeatMs: number; expiresAt: Date;
    onError(error: unknown): void;
  }) {
    this.armDeadline(input.expiresAt);
    this.schedule();
  }

  private lose(error: unknown): void {
    if (this.signal.aborted || this.closed) return;
    this.lost = true;
    this.controller.abort(new RunLeaseLostError());
    this.input.onError(error);
  }

  private armDeadline(expiresAt: Date): void {
    clearTimeout(this.deadline);
    const delay = Math.max(0, expiresAt.getTime() - this.input.runtime.now().getTime());
    if (delay === 0) {this.lose(new RunLeaseLostError()); return;}
    this.deadline = setTimeout(() => this.lose(new RunLeaseLostError()), delay);
    this.deadline.unref();
  }

  private schedule(): void {
    if (this.closed || this.signal.aborted) return;
    this.renewal = setTimeout(() => {
      void this.renew().catch(error => this.lose(error));
    }, this.input.heartbeatMs);
    this.renewal.unref();
  }

  private async renew(): Promise<void> {
    const {runtime, repository, runId, owner} = this.input;
    const now = runtime.now(), expiresAt = runtime.leaseExpiresAt(now);
    const owned = await repository.heartbeat(runId, owner, expiresAt, now);
    if (this.closed || this.signal.aborted) return;
    if (!owned) {this.lose(new RunLeaseLostError()); return;}
    this.armDeadline(expiresAt);
    this.schedule();
  }

  cancel(): void {this.lost = true; this.controller.abort(new RunLeaseLostError());}

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.renewal);
    clearTimeout(this.deadline);
    // The executor has settled. A stuck renewal must not block releasing this owner.
    // Late renewal results are ignored and cannot renew a later attempt's unique owner.
    this.controller.abort(new RunLeaseLostError());
  }
}
