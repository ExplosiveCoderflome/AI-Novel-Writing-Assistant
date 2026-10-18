import {AsyncLocalStorage} from "node:async_hooks";

const executions = new AsyncLocalStorage<AbortSignal>();

/** Runtime authority only. Never use cancellation as a quality/intent decision. */
export function withExecutionSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  // Consume lazy Prisma promises inside the scope, not at the caller's await site.
  return executions.run(executionSignal(signal)!, async () => await work());
}

export function executionSignal(upstream?: AbortSignal): AbortSignal | undefined {
  const current = executions.getStore();
  return current && upstream && current !== upstream ? AbortSignal.any([current, upstream]) : current ?? upstream;
}

export function assertExecutionActive(): void {
  executions.getStore()?.throwIfAborted();
}
