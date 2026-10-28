import { withModelRequestBudget } from "../../../platform/llm/retries";
import { InvalidProductionBudgetError, ProductionBudgetExceededError } from "../common";
import { hashProductionContent } from "../application";

/** Wrap legacy lower services so their protocol/format/transport retries cannot renew a saved allowance. */
export async function runWithProductionRequestBudget<T>(input: {
  stageRequestKey: string;
  maxRequests: number;
  /** Caller reserves against the durable chapter/job budget, idempotent by this physical request key. */
  reserve(input: { requestKey: string; ordinal: number }): Promise<boolean>;
  fence(): Promise<void>;
}, run: () => Promise<T>): Promise<T> {
  if (!input.stageRequestKey || !Number.isSafeInteger(input.maxRequests) || input.maxRequests < 1) {
    throw new InvalidProductionBudgetError("Invalid physical request allowance");
  }
  let dispatched = 0;
  let unsafe: unknown;
  const budget = {
    remaining: () => unsafe ? 0 : Math.max(0, input.maxRequests - dispatched),
    beforeRequest: async () => {
      if (unsafe) throw unsafe;
      try {
        if (dispatched >= input.maxRequests) throw new ProductionBudgetExceededError();
        const ordinal = ++dispatched;
        const requestKey = hashProductionContent(`${input.stageRequestKey}:physical:${ordinal}`);
        if (!await input.reserve({ requestKey, ordinal })) throw new ProductionBudgetExceededError();
        await input.fence();
      } catch (error) { unsafe = error; throw error; }
    },
  };
  let result: T;
  try { result = await withModelRequestBudget(budget, run); }
  catch (error) { throw unsafe ?? error; }
  if (unsafe) throw unsafe;
  return result;
}
