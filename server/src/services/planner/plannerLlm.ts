import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StoryPlanLevel } from "@ai-novel/shared/types/novel";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { normalizePlannerOutput, type PlannerOutput } from "./plannerOutputNormalization";
import { plannerOutputSchema } from "./plannerSchemas";

export interface PlannerLlmOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export async function invokePlannerLLM(input: {
  options: PlannerLlmOptions;
  scopeLabel: string;
  context: string;
  storyModeBlock?: string;
  includeScenes: boolean;
  planLevel: StoryPlanLevel;
}): Promise<PlannerOutput> {
  const context = [
    input.storyModeBlock?.trim() || "",
    input.context,
  ].filter(Boolean).join("\n\n");

  const systemPrompt = [
    "You are a long-form novel planning assistant.",
    "Return strict JSON only.",
    "The response must contain the fields title, objective, participants, reveals, riskNotes, hookTarget, planRole, phaseLabel, mustAdvance, mustPreserve, and scenes.",
    `planLevel=${input.planLevel}.`,
    input.includeScenes
      ? "scenes must be an array, and each item must include title, objective, conflict, reveal, and emotionBeat."
      : "scenes must be an empty array.",
    "For book and arc plans, planRole may be null or omitted.",
    "For chapter plans, planRole must be one of setup, progress, pressure, turn, payoff, or cooldown.",
    "mustAdvance and mustPreserve should be concise, concrete, and directly usable by downstream writing steps.",
    "Do not output markdown fences or any explanation outside the JSON object.",
  ].join(" ");

  const userPrompt = [
    input.scopeLabel,
    "",
    "Context:",
    context,
    "",
    "Requirements:",
    "1. objective must state the main progression target for this planning layer.",
    "2. participants should list only the key involved characters or factions.",
    "3. reveals should capture important information disclosures or structural turns.",
    "4. riskNotes should explain where the story may drift, flatten, or violate constraints.",
    "5. hookTarget should describe the lingering question, tension, or emotional carry-over.",
    "6. phaseLabel should summarize the current phase in a short phrase.",
    "7. mustAdvance should list the non-negotiable beats that must move forward.",
    "8. mustPreserve should list continuity, tone, and constraint items that must not be broken.",
    "9. When story mode constraints exist in the context, treat the primary mode as a hard constraint and the secondary mode only as a limited flavor layer.",
    "10. Never raise conflict intensity beyond the declared story mode ceiling, and never rely on forbidden conflict forms.",
    "11. If scenes are required, they must be ordered and immediately usable for downstream chapter writing.",
  ].join("\n");

  const parsed = await invokeStructuredLlm({
    label: `planner:${input.planLevel}`,
    provider: input.options.provider,
    model: input.options.model,
    temperature: input.options.temperature ?? 0.4,
    taskType: "planner",
    systemPrompt,
    userPrompt,
    schema: plannerOutputSchema,
    maxRepairAttempts: 1,
  });

  return normalizePlannerOutput(parsed);
}
