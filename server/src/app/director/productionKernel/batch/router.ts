import type { StepContext, StepHandler } from "../../../../modules/director";
import type { ProductionBatchImplementation } from "./binding";

export const productionKernelV2ChaptersEnabled = (): boolean => ["true","1"].includes(process.env.PRODUCTION_KERNEL_V2_CHAPTERS ?? "false");
export function createProductionBatchRouter(input: {
  enabled(): boolean;
  choose(context: StepContext, enabled: boolean): Promise<ProductionBatchImplementation>;
  legacy: StepHandler;
  kernel: StepHandler;
}): StepHandler {
  return async context => {
    const selected = await input.choose(context,input.enabled());
    if (selected === "legacy") return input.legacy(context);
    if (selected === "kernel") return input.kernel(context);
    throw new Error("Unknown saved production implementation");
  };
}
