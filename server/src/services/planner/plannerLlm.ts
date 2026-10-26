import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StoryPlanLevel } from "@ai-novel/shared/types/novel";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import type { PromptContextBlock } from "../../prompting/core/promptTypes";
import { normalizePlannerOutput, type PlannerOutput } from "./plannerOutputNormalization";
import {
  plannerArcPlanPrompt,
  plannerBookPlanPrompt,
  plannerChapterPlanPrompt,
} from "../../prompting/prompts/planner/plannerPlan.prompts";

export interface PlannerLlmOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export function buildPlannerPromptRequest(input: {
  novelId: string;
  chapterId?: string;
  options: PlannerLlmOptions;
  scopeLabel: string;
  planLevel: StoryPlanLevel;
  contextBlocks: PromptContextBlock[];
}) {
  const asset = input.planLevel === "book"
    ? plannerBookPlanPrompt
    : input.planLevel === "arc"
      ? plannerArcPlanPrompt
      : plannerChapterPlanPrompt;
  return {
    asset,
    promptInput: {
      scopeLabel: input.scopeLabel,
    },
    contextBlocks: input.contextBlocks,
    options: {
      novelId: input.novelId,
      chapterId: input.chapterId,
      provider: input.options.provider,
      model: input.options.model,
      temperature: input.options.temperature ?? 0.4,
    },
  };
}

export async function invokePlannerLLM(input: Parameters<typeof buildPlannerPromptRequest>[0]): Promise<PlannerOutput> {
  const result = await runStructuredPrompt(buildPlannerPromptRequest(input));

  return normalizePlannerOutput(result.output);
}
