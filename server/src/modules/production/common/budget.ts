export class InvalidProductionBudgetError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidProductionBudgetError"; }
}
export class ProductionBudgetExceededError extends Error {
  constructor() { super("本次调用预算不足，需从作品页确认后继续。"); this.name = "ProductionBudgetExceededError"; }
}
/** Only the physical request adapter may supply this proof; ordinary budget errors do not prove no dispatch. */
export class ProductionBudgetNotDispatchedError extends ProductionBudgetExceededError {
  constructor() { super(); this.name = "ProductionBudgetNotDispatchedError"; }
}
function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new InvalidProductionBudgetError(`Invalid ${name}`);
  return value;
}

/** One token per UTF-8 byte is a deliberately conservative estimate, not provider billing. */
export function checkContextBudget(input: {
  input: string;
  contextWindow: number | null;
  outputTokens: number;
  safetyTokens: number;
  inputTokenCount?: number;
}): { ok: boolean; estimatedInputTokens: number; requiredTokens: number; contextWindow: number }
  | { ok: false; reason: "unknown_context_window"; estimatedInputTokens: number } {
  const estimatedInputTokens = integer(input.inputTokenCount ?? new TextEncoder().encode(input.input).length, "input tokens");
  const output = integer(input.outputTokens, "output tokens");
  const safety = integer(input.safetyTokens, "safety tokens");
  if (input.contextWindow === null) return { ok: false, reason: "unknown_context_window", estimatedInputTokens };
  const window = integer(input.contextWindow, "context window", 1);
  const requiredTokens = integer(estimatedInputTokens + output + safety, "required tokens");
  return { ok: requiredTokens <= window, estimatedInputTokens, requiredTokens, contextWindow: window };
}

export interface ProductionBudgetReservation { accepted: boolean; reservationKey: string }
export interface ProductionUsageFact {
  requestKey: string;
  invocationId: string;
  status: "completed" | "partial" | "failed";
  inputTokens: number | null;
  outputTokens: number | null;
}
/** Observed billing is a fact, even after cancellation. The durable sink deduplicates invocationId. */
export async function recordProductionUsage(fact: ProductionUsageFact, record: (fact: ProductionUsageFact) => Promise<void>): Promise<void> {
  if (!fact.requestKey || !fact.invocationId || !["completed", "partial", "failed"].includes(fact.status)) {
    throw new InvalidProductionBudgetError("Invalid usage identity or status");
  }
  if (fact.inputTokens !== null) integer(fact.inputTokens, "observed input tokens");
  if (fact.outputTokens !== null) integer(fact.outputTokens, "observed output tokens");
  await record({ ...fact });
}
export async function invokeWithBudget<T>(input: {
  requestKey: string;
  /** Durable and idempotent by requestKey; failed calls still retain their reservation. */
  reserve: (requestKey: string) => Promise<ProductionBudgetReservation>;
  fence: () => Promise<void>;
  invoke: () => Promise<T>;
}): Promise<T> {
  if (!input.requestKey) throw new InvalidProductionBudgetError("Request key is required");
  const reservation = await input.reserve(input.requestKey);
  if (!reservation.accepted) throw new ProductionBudgetExceededError();
  if (reservation.reservationKey !== input.requestKey) throw new InvalidProductionBudgetError("Reservation identity mismatch");
  await input.fence();
  const result = await input.invoke();
  await input.fence();
  return result;
}
