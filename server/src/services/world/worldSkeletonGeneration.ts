import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  WorldGenerationBlueprint,
  WorldReferenceContext,
  WorldSkeletonGenerationPayload,
  WorldSkeletonGenerationOptions,
} from "@ai-novel/shared/types/worldWizard";
import { normalizeWorldSkeletonGenerationOptions } from "@ai-novel/shared/types/worldWizard";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { worldSkeletonGenerationPrompt } from "../../prompting/prompts/world/worldDraft.prompts";
import {
  buildWorldBindingSupport,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";

export interface WorldSkeletonGenerateInput {
  idea: string;
  worldType?: string;
  template?: string;
  referenceContext?: WorldReferenceContext | null;
  blueprint?: WorldGenerationBlueprint | null;
  options?: Partial<WorldSkeletonGenerationOptions>;
  provider?: LLMProvider;
  model?: string;
}

export async function generateWorldSkeleton(
  input: WorldSkeletonGenerateInput,
): Promise<WorldSkeletonGenerationPayload> {
  const options = normalizeWorldSkeletonGenerationOptions(input.options);
  const result = await runStructuredPrompt({
    asset: worldSkeletonGenerationPrompt,
    promptInput: {
      idea: input.idea,
      worldType: input.worldType,
      template: input.template,
      referenceContext: input.referenceContext ?? null,
      blueprint: input.blueprint ?? null,
      options,
    },
    options: {
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: 0.7,
    },
  });

  const output = result.output;
  const structuredData = normalizeWorldStructuredData({
    ...output.structuredData,
    metadata: {
      ...output.structuredData.metadata,
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: "world-skeleton",
      lastGeneratedAt: new Date().toISOString(),
    },
  });
  const generatedBindingSupport = buildWorldBindingSupport(structuredData);
  const bindingSupport = normalizeWorldBindingSupport(output.bindingSupport, {
    ...generatedBindingSupport,
    recommendedEntryPoints: [
      ...output.storyEntrySuggestions.map((item) => `${item.title}：${item.description}`),
      ...generatedBindingSupport.recommendedEntryPoints,
    ].slice(0, 6),
  });

  return {
    concept: output.concept,
    structuredData,
    bindingSupport,
    storyEntrySuggestions: output.storyEntrySuggestions,
    assessment: output.assessment,
  };
}
