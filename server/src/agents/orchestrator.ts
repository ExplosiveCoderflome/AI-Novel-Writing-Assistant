import type { PlannerInput, PlannerResult } from "./types";
import { compileIntentToPlan, toPlannedActions } from "./planner/compiler";
import { parseIntentWithLLM } from "./planner/parser";

export async function createStructuredPlan(input: PlannerInput): Promise<PlannerResult> {
  const structuredIntent = await parseIntentWithLLM(input);
  const compiledPlan = compileIntentToPlan(structuredIntent, input);
  const actions = toPlannedActions(compiledPlan);
  return {
    structuredIntent,
    plan: compiledPlan,
    actions,
    source: "llm",
    validationWarnings: structuredIntent.confidence < 0.3
      ? ["LLM intent confidence is low."]
      : [],
  };
}
