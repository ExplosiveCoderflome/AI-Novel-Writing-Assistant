import { AsyncLocalStorage } from "node:async_hooks";
import { runWithInvocationUsageObserver, type InvocationUsageRecord } from "../../../../platform/llm/usage";
import { runWithProductionRequestBudget, type UnitRef } from "../../../../modules/production";
import { ProductionBudgetExceededError, ProductionBudgetNotDispatchedError } from "../../../../modules/production/common";
import { currentModelRequestDescription, type PhysicalModelRequest } from "../../../../platform/llm/retries";

interface PhysicalBudget {
  reserve(unit: UnitRef, requestKey: string, tokens: number): Promise<boolean>;
  observe(unit: UnitRef, requestKey: string, record: InvocationUsageRecord): Promise<void>;
  releaseUndispatched(unit: UnitRef, requestKey: string): Promise<void>;
}
const scope = new AsyncLocalStorage<{rejectBeforeDispatch(): Promise<void>}>();
/** Call only on a typed lower retry-budget rejection that occurred inside beforeRequest, before invoking the model. */
export async function markKernelRequestNotDispatched(): Promise<void> {
  const current = scope.getStore();
  if (!current) throw new Error("No kernel physical request scope");
  await current.rejectBeforeDispatch();
}

export async function runKernelRequestScope<T>(input: {unit: UnitRef; requestKey: string; maxRequests: number;
  reserveTokens: number | ((request: PhysicalModelRequest | undefined) => number);
  budget: PhysicalBudget; fence(): Promise<void>}, operation: () => Promise<T>): Promise<T> {
  const accepted = new Set<string>(), observed = new Set<string>(), released = new Set<string>();
  let pending: string | undefined, unsafe: unknown;
  const listener = async (record: InvocationUsageRecord) => {
    const key = pending;
    try {
      if (!key || record.novelId !== input.unit.novelId || record.chapterId !== input.unit.chapterId) throw new Error("Physical usage observation identity differs");
      observed.add(key);
      await input.budget.observe(input.unit,key,record);
      pending = undefined;
    } catch (error) {unsafe = error; throw error;}
  };
  try {
    const result = await scope.run({rejectBeforeDispatch:async()=>{
      if (!pending || observed.has(pending)) throw new Error("Cannot release an observed model invocation");
      await input.budget.releaseUndispatched(input.unit,pending);
      released.add(pending);pending = undefined;
    }},()=>runWithProductionRequestBudget({stageRequestKey:input.requestKey,maxRequests:input.maxRequests,
      reserve:async({requestKey})=>{
        if (unsafe) throw unsafe;
        if (pending) throw new Error("Concurrent physical requests cannot share one production scope");
        const tokens=typeof input.reserveTokens === "function" ? input.reserveTokens(currentModelRequestDescription()) : input.reserveTokens;
        if(!Number.isSafeInteger(tokens)||tokens<1)throw new Error("Physical request requires a valid full token reservation");
        if (!await input.budget.reserve(input.unit,requestKey,tokens)) return false;
        accepted.add(requestKey);pending = requestKey;return true;
      },fence:input.fence},()=>runWithInvocationUsageObserver(listener,operation)));
    if (unsafe) throw unsafe;
    if (pending) throw new Error("Physical invocation usage observation is unavailable");
    return result;
  } catch (error) {
    if (unsafe) throw unsafe;
    if (error instanceof ProductionBudgetExceededError && !observed.size && [...accepted].every(key=>released.has(key))) {
      throw new ProductionBudgetNotDispatchedError();
    }
    throw error;
  }
}
