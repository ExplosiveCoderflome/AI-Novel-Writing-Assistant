import { StepRegistry, type StepHandler } from "../application";
import { directorProductionPlan } from "./planDefinition";

export type ProductionStepId = "story_macro" | "book_contract" | "world_setup" | "character_setup" | "volume_strategy"
  | "volume_beat_sheet" | "volume_chapter_list" | "chapter_detail_bundle" | "execution_contract_sync" | "chapter_batch";
/** Assembly supplies real adapters. Missing implementations must fail before a run is launched. */
export function createProductionStepRegistry(handlers: Record<ProductionStepId, StepHandler>): StepRegistry {
  const registry = new StepRegistry();
  for (const step of directorProductionPlan.steps) {
    const handler = handlers[step.id as ProductionStepId];
    if (typeof handler !== "function") throw new Error(`missing director production implementation: ${step.id}`);
    registry.register(step.id, handler);
  }
  return registry;
}
