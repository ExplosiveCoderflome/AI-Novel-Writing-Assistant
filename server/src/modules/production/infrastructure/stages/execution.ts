import { InvalidProductionRequestError, type StageDescriptor, type UnitRun } from "../../application";
import type { ChapterStageServices, PreparedStageCall } from "./contracts";

export function preparedCall(invocation: StageDescriptor): PreparedStageCall {
  if (invocation.input === undefined) throw new InvalidProductionRequestError("Stage invocation is missing its prepared input");
  return invocation as PreparedStageCall;
}
export function executeScoped<T>(services: ChapterStageServices, run: UnitRun,
  invocation: StageDescriptor & { requestKey: string }, operation: (call: PreparedStageCall) => Promise<T>): Promise<T> {
  const call = preparedCall(invocation);
  return services.scoped(run, invocation, () => operation(call));
}
