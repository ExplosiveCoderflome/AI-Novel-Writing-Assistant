import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  chapterDynamicExtractionSchema,
  volumeDynamicsProjectionSchema,
} from "../../../services/novel/dynamics/characterDynamicsSchemas";

export interface VolumeDynamicsProjectionPromptInput {
  novelTitle: string;
  description: string;
  targetAudience: string;
  sellingPoint: string;
  firstPromise: string;
  outline: string;
  structuredOutline: string;
  appliedCastOption: string;
  rosterText: string;
  relationText: string;
  volumePlansText: string;
}

export interface ChapterDynamicsExtractionPromptInput {
  novelTitle: string;
  targetAudience: string;
  sellingPoint: string;
  firstPromise: string;
  currentVolumeTitle: string;
  rosterText: string;
  relationText: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterContent: string;
}

export const volumeDynamicsProjectionPrompt: PromptAsset<
  VolumeDynamicsProjectionPromptInput,
  z.infer<typeof volumeDynamicsProjectionSchema>
> = {
  id: "novel.characterDynamics.volumeProjection",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: volumeDynamicsProjectionSchema,
  render: (input) => [
    new SystemMessage([
      "You project a dynamic role system for a long-form web novel.",
      "Return strict JSON only.",
      "Use every volume and decide which existing characters are core, what they must carry, how often they should appear, what faction pressure they represent, and what the current relationship stage is.",
      "Do not create new characters here. Only use names from the known roster.",
      "Assignments must reflect target audience, selling point, and first 30 chapter promise.",
      "Core characters should usually have warning threshold 3 and high threshold 5 unless there is a strong reason not to.",
    ].join("\n")),
    new HumanMessage([
      `Novel: ${input.novelTitle}`,
      `Description: ${input.description}`,
      `Target audience: ${input.targetAudience}`,
      `Selling point: ${input.sellingPoint}`,
      `First 30 chapter promise: ${input.firstPromise}`,
      `Outline: ${input.outline}`,
      `Structured outline: ${input.structuredOutline}`,
      `Applied cast option: ${input.appliedCastOption}`,
      `Known roster:\n${input.rosterText}`,
      `Known structured relations:\n${input.relationText}`,
      `Volume plans:\n${input.volumePlansText}`,
    ].join("\n\n")),
  ],
};

export const chapterDynamicsExtractionPrompt: PromptAsset<
  ChapterDynamicsExtractionPromptInput,
  z.infer<typeof chapterDynamicExtractionSchema>
> = {
  id: "novel.characterDynamics.chapterExtract",
  version: "v1",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: chapterDynamicExtractionSchema,
  render: (input) => [
    new SystemMessage([
      "You extract dynamic character facts from a drafted chapter.",
      "Return strict JSON only.",
      "Do not invent characters that are already in the known roster unless the chapter clearly introduces a genuinely new person.",
      "Candidates are only for truly new, named, story-relevant roles.",
      "Faction updates are only for meaningful allegiance or camp signals, not vague moods.",
      "Relation stages are only for meaningful progression or regression between named existing characters.",
    ].join("\n")),
    new HumanMessage([
      `Novel: ${input.novelTitle}`,
      `Target audience: ${input.targetAudience}`,
      `Selling point: ${input.sellingPoint}`,
      `First 30 chapter promise: ${input.firstPromise}`,
      `Current volume: ${input.currentVolumeTitle}`,
      `Known roster:\n${input.rosterText}`,
      `Known structured relations:\n${input.relationText}`,
      `Chapter ${input.chapterOrder} ${input.chapterTitle}`,
      input.chapterContent,
    ].join("\n\n")),
  ],
};
