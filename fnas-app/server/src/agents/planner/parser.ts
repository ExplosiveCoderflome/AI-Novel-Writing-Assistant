import type { PlannerInput, StructuredIntent } from "../types";
import { plannerIntentPrompt } from "../../prompting/prompts/agent/plannerIntent.prompt";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  intentSchema,
  summarizeIntentValidationFailure,
} from "./intentPromptSupport";

export { intentSchema, summarizeIntentValidationFailure } from "./intentPromptSupport";

export async function parseIntentWithLLM(input: PlannerInput): Promise<StructuredIntent> {
  const result = await runStructuredPrompt({
    asset: plannerIntentPrompt,
    promptInput: input,
    options: {
      provider: input.provider,
      model: input.model,
      temperature: typeof input.temperature === "number" ? Math.min(input.temperature, 0.15) : 0.1,
      maxTokens: input.maxTokens,
    },
  });
  return result.output;
}
