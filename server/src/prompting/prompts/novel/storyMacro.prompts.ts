import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroLocks,
} from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import { STORY_MACRO_RESPONSE_SCHEMA } from "../../../services/novel/storyMacro/storyMacroPlanSchema";
import {
  buildExpansionAndDecompositionPrompt,
  buildFieldRegenerationPrompt,
} from "../../../services/novel/storyMacro/storyMacroPrompts";

export interface StoryMacroDecompositionPromptInput {
  storyInput: string;
  projectContext: string;
}

export interface StoryMacroFieldRegenerationPromptInput {
  field: StoryMacroField;
  storyInput: string;
  expansion: StoryExpansion;
  decomposition: StoryDecomposition;
  constraints: string[];
  lockedFields: StoryMacroLocks;
  projectContext: string;
}

export const storyMacroDecompositionPrompt: PromptAsset<
  StoryMacroDecompositionPromptInput,
  typeof STORY_MACRO_RESPONSE_SCHEMA._output
> = {
  id: "novel.story_macro.decomposition",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: STORY_MACRO_RESPONSE_SCHEMA,
  render: (input) => {
    const prompt = buildExpansionAndDecompositionPrompt(input.storyInput, input.projectContext);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};

export const storyMacroFieldRegenerationSchema = z.object({
  value: z.unknown().optional(),
}).passthrough();

export const storyMacroFieldRegenerationPrompt: PromptAsset<
  StoryMacroFieldRegenerationPromptInput,
  typeof storyMacroFieldRegenerationSchema._output
> = {
  id: "novel.story_macro.field_regeneration",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: storyMacroFieldRegenerationSchema,
  render: (input) => {
    const prompt = buildFieldRegenerationPrompt({
      field: input.field,
      storyInput: input.storyInput,
      expansion: input.expansion,
      decomposition: input.decomposition,
      constraints: input.constraints,
      lockedFields: input.lockedFields,
      projectContext: input.projectContext,
    });
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};
