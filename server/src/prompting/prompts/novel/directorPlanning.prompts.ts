import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCorrectionPreset,
  DirectorProjectContextInput,
} from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import {
  directorCandidateResponseSchema,
  directorPlanBlueprintSchema,
} from "../../../services/novel/director/novelDirectorSchemas";
import {
  buildDirectorBlueprintPrompt,
  buildDirectorCandidatePrompt,
} from "../../../services/novel/director/novelDirectorPrompts";

export interface DirectorCandidatePromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
}

export interface DirectorBlueprintPromptInput {
  idea: string;
  context: DirectorProjectContextInput;
  candidate: DirectorCandidate;
  storyMacroPlan: StoryMacroPlan;
  targetChapterCount: number;
}

export const directorCandidatePrompt: PromptAsset<DirectorCandidatePromptInput, typeof directorCandidateResponseSchema._output> = {
  id: "novel.director.candidates",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: directorCandidateResponseSchema,
  render: (input) => {
    const prompt = buildDirectorCandidatePrompt(input);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};

export const directorBlueprintPrompt: PromptAsset<DirectorBlueprintPromptInput, typeof directorPlanBlueprintSchema._output> = {
  id: "novel.director.blueprint",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: directorPlanBlueprintSchema,
  render: (input) => {
    const prompt = buildDirectorBlueprintPrompt(input);
    return [new SystemMessage(prompt.system), new HumanMessage(prompt.user)];
  },
};
