import {AsyncLocalStorage} from "node:async_hooks";

export interface LlmTaskOutputBudget {provider: string; model: string; taskType: string; maxTokens: number}
const key = (provider: string, model: string, taskType: string) => JSON.stringify([provider, model, taskType]);
const storage = new AsyncLocalStorage<{budgets: Map<string, number>; failure?: Error}>();

/** Configuration capture reads persisted settings, independently of an executing stage's frozen allowance. */
export const withoutLlmTaskOutputBudgets = <T>(operation: () => Promise<T>): Promise<T> => storage.exit(operation);

/** Caller-owned task allowances replace legacy request defaults only inside this asynchronous execution. */
export function withLlmTaskOutputBudgets<T>(rows: readonly LlmTaskOutputBudget[], operation: () => Promise<T>): Promise<T> {
  const budgets = new Map<string, number>();
  for (const row of rows) {
    const id = key(row.provider, row.model, row.taskType);
    if (!row.provider || !row.model || !row.taskType || !Number.isSafeInteger(row.maxTokens) || row.maxTokens < 1 || budgets.has(id)) {
      throw new Error("Invalid task output budget");
    }
    budgets.set(id, row.maxTokens);
  }
  const state: {budgets: Map<string, number>; failure?: Error} = {budgets};
  return storage.run(state, async () => {
    try {const result = await operation(); if (state.failure) throw state.failure; return result;}
    catch (error) {throw state.failure ?? error;}
  });
}

export function resolveScopedTaskOutputTokens(provider: string, model: string, taskType: string | undefined,
  current: number | undefined): number | undefined {
  const state = storage.getStore();
  if (!state) return current;
  if (state.failure) throw state.failure;
  const tokens = taskType ? state.budgets.get(key(provider, model, taskType)) : undefined;
  if (tokens === undefined) {
    state.failure = new Error("Model target has no captured task output budget");
    throw state.failure;
  }
  return tokens;
}
