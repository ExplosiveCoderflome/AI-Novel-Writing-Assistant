import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  characterFinalPayloadSchema,
  characterSkeletonOutputSchema,
} from "../../../services/character/characterSchemas";

export interface BaseCharacterSkeletonPromptInput {
  description: string;
  category: string;
  genre: string;
  constraintsText: string;
  referenceContext: string;
}

export interface BaseCharacterFinalPromptInput {
  skeleton: Record<string, unknown>;
  constraintsText: string;
  referenceContext: string;
}

export const baseCharacterSkeletonPrompt: PromptAsset<
  BaseCharacterSkeletonPromptInput,
  z.infer<typeof characterSkeletonOutputSchema>
> = {
  id: "character.base.skeleton",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterSkeletonOutputSchema,
  render: (input) => [
    new SystemMessage(`You are a senior Chinese fiction character planner.
Task: generate a character skeleton JSON only.
Priority: constraints > reference context > user description.
If constraints conflict, put conflict points into conflictNotes.
Output valid JSON only, no markdown, no explanation.
Required JSON keys:
{
  "nameSuggestion": "...",
  "role": "...",
  "corePersona": "...",
  "surfaceTemperament": "...",
  "coreDrive": "...",
  "socialMask": "...",
  "behaviorPatterns": ["..."],
  "triggerPoints": ["..."],
  "lifeOrigin": "...",
  "relationshipNetwork": ["..."],
  "externalGoal": "...",
  "internalNeed": "...",
  "coreFear": "...",
  "moralBottomLine": "...",
  "secret": "...",
  "coreFlaw": "...",
  "growthArc": ["phase1","phase2","phase3"],
  "keyEvents": ["event1","event2","event3"],
  "dailyAnchors": ["..."],
  "habitualActions": ["..."],
  "speechStyle": "...",
  "talents": ["..."],
  "conflictKeywords": ["..."],
  "themeKeywords": ["..."],
  "bodyType": "...",
  "facialFeatures": "...",
  "styleSignature": "...",
  "auraAndVoice": "...",
  "appearance": "...",
  "toneStyle": "...",
  "conflictNotes": ["..."]
}`),
    new HumanMessage(`Character description: ${input.description}
Character category: ${input.category}
Genre: ${input.genre}
Constraints:
${input.constraintsText}
${input.referenceContext ? `Reference context:
${input.referenceContext}` : "Reference context: none"}`),
  ],
};

export const baseCharacterFinalPrompt: PromptAsset<
  BaseCharacterFinalPromptInput,
  z.infer<typeof characterFinalPayloadSchema>
> = {
  id: "character.base.final",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterFinalPayloadSchema,
  render: (input) => [
    new SystemMessage(`You are a senior Chinese fiction character editor.
Convert the character skeleton into final storage JSON.
Priority: constraints > reference context > user description.
Field requirements:
- personality: include core persona + surface temperament + core drive + behavior patterns + emotional triggers.
- appearance: include body type + facial features + style signature + aura/voice.
- background: include origin + relationship network + secret.
- development: 3-stage growth arc.
- weaknesses: flaw + cost.
- interests: include daily anchors + habitual actions + speech style + talents.
- keyEvents: exactly 3 pivotal events, joined in one string.
- tags: comma-separated, include role + conflict/theme keywords + distinguishing traits.
Output valid JSON only:
{
  "name": "...",
  "role": "...",
  "personality": "...",
  "background": "...",
  "development": "...",
  "appearance": "...",
  "weaknesses": "...",
  "interests": "...",
  "keyEvents": "...",
  "tags": "tag1,tag2"
}`),
    new HumanMessage(`Character skeleton:
${JSON.stringify(input.skeleton, null, 2)}
Constraints:
${input.constraintsText}
${input.referenceContext ? `Reference context:
${input.referenceContext}` : "Reference context: none"}`),
  ],
};
