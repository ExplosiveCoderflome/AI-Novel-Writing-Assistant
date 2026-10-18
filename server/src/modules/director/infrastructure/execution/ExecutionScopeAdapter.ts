import {withExecutionSignal} from "../../../../platform/runtime/execution";

/** Application receives a cancellation port; only this adapter knows AsyncLocalStorage. */
export function withDirectorExecution<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return withExecutionSignal(signal, work);
}
