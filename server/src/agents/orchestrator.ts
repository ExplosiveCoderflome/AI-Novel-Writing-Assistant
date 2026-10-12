import type { PlannerInput, PlannerResult } from "./types";
import { compileIntentToPlan, toPlannedActions } from "./planner/compiler";
import { parseIntentWithLLM } from "./planner/parser";
import type { StructuredIntent } from "./types";

const CREATIVE_HUB_EXECUTION_INTENTS = new Set<StructuredIntent["intent"]>([
  "create_novel", "select_novel_workspace", "bind_world_to_novel", "unbind_world_from_novel",
  "produce_novel", "run_director_next_step", "run_director_until_gate", "switch_director_policy",
  "write_chapter", "rewrite_chapter", "save_chapter_draft", "start_pipeline", "ideate_novel_setup",
]);

export async function createStructuredPlan(input: PlannerInput): Promise<PlannerResult> {
  const parsedIntent = await parseIntentWithLLM(input);
  const structuredIntent = input.profile === "creative_hub_readonly"
    && CREATIVE_HUB_EXECUTION_INTENTS.has(parsedIntent.intent)
    ? {
      ...parsedIntent,
      intent: "workflow_handoff" as const,
      interactionMode: "query" as const,
      assistantResponse: "explain" as const,
      shouldAskFollowup: false,
      note: parsedIntent.note ?? "请从正式小说工作台或自动导演入口执行该操作。",
    }
    : parsedIntent;
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
