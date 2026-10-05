import type {StepHandler} from "../../../modules/director";
import {runWithLlmUsageTracking} from "../../../llm/usageTracking";
export function withStepUsage<T extends Record<string,StepHandler>>(handlers:T):T{
 return Object.fromEntries(Object.entries(handlers).map(([id,handler])=>[id,((context)=>runWithLlmUsageTracking({directorNextRunId:context.runId,novelId:context.contract.novelId,stage:id},()=>handler(context))) as StepHandler])) as T;
}
