import { AsyncLocalStorage } from "node:async_hooks";
import type { ResolvedLLMClientOptions } from "../../../llm/factory";

export interface PhysicalModelRequest {
  configuration?: ResolvedLLMClientOptions;
  input: unknown;
  options?: unknown;
}

export interface ModelRequestBudget {
  beforeRequest: () => Promise<void>;
  remaining: () => number;
}

const requestBudget = new AsyncLocalStorage<ModelRequestBudget>();
const requestDescription = new AsyncLocalStorage<PhysicalModelRequest | undefined>();
export const currentModelRequestDescription = (): PhysicalModelRequest | undefined => requestDescription.getStore();

export function withModelRequestBudget<T>(budget: ModelRequestBudget, run: () => Promise<T>): Promise<T> {
  return requestBudget.run(budget, run);
}

export function currentModelRequestBudget(): ModelRequestBudget | undefined {
  return requestBudget.getStore();
}

/** Claim before every paid request, including JSON repair, protocol fallback and transport retry. */
export async function claimModelRequest(description?: PhysicalModelRequest): Promise<void> {
  await requestDescription.run(description,()=>requestBudget.getStore()?.beforeRequest());
}
