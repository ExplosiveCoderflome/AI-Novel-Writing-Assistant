import type { PlannerInput, PlannerResult } from "./types";
import { compileIntentToPlan, toPlannedActions } from "./planner/compiler";
import { inferFallbackIntent } from "./planner/fallback";
import { parseIntentWithLLM } from "./planner/parser";

export async function createStructuredPlan(input: PlannerInput): Promise<PlannerResult> {
  const fallbackIntent = inferFallbackIntent(input);
  const fallbackPlan = compileIntentToPlan(fallbackIntent, input);

  try {
    const structuredIntent = await parseIntentWithLLM(input);
    const compiledPlan = compileIntentToPlan(structuredIntent, input);
    const actions = toPlannedActions(compiledPlan);
    if (actions.length === 0 || structuredIntent.confidence < 0.3) {
      return {
        structuredIntent: fallbackIntent,
        plan: fallbackPlan,
        actions: toPlannedActions(fallbackPlan),
        source: "fallback",
        validationWarnings: ["LLM intent low confidence, fallback applied."],
      };
    }
    return {
      structuredIntent,
      plan: compiledPlan,
      actions,
      source: "llm",
      validationWarnings: [],
    };
  } catch {
    return {
      structuredIntent: fallbackIntent,
      plan: fallbackPlan,
      actions: toPlannedActions(fallbackPlan),
      source: "fallback",
      validationWarnings: ["LLM intent parser failed, fallback applied."],
    };
  }
}
