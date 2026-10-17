import { AsyncLocalStorage } from "node:async_hooks";

export interface ModelRequestBudget {
  beforeRequest: () => Promise<void>;
  remaining: () => number;
}

const requestBudget = new AsyncLocalStorage<ModelRequestBudget>();

export function withModelRequestBudget<T>(budget: ModelRequestBudget, run: () => Promise<T>): Promise<T> {
  return requestBudget.run(budget, run);
}

export function currentModelRequestBudget(): ModelRequestBudget | undefined {
  return requestBudget.getStore();
}

/** Claim before every paid request, including JSON repair, protocol fallback and transport retry. */
export async function claimModelRequest(): Promise<void> {
  await requestBudget.getStore()?.beforeRequest();
}
