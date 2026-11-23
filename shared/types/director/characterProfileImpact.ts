import { z } from "zod";
import { characterProfileFields, characterProfileSaveSchema, type CharacterProfileDraft } from "./characterProfile.js";

export const characterProfileImpactResourceTypes = [
  "synopsis", "world", "relationship", "volume_plan", "chapter_plan", "prose",
] as const;

export type CharacterProfileImpactResourceType = typeof characterProfileImpactResourceTypes[number];

export const characterProfileImpactResourceLabels: Record<CharacterProfileImpactResourceType, string> = {
  synopsis: "简介",
  world: "世界设定",
  relationship: "人物关系",
  volume_plan: "卷章规划",
  chapter_plan: "章节规划",
  prose: "正文",
};

export const characterProfileImpactParagraphSchema = z.object({
  paragraph: z.number().int().positive(),
  before: z.string().min(1),
}).strict();

export type CharacterProfileImpactParagraph = z.infer<typeof characterProfileImpactParagraphSchema>;

export const characterProfileImpactCandidateSchema = z.object({
  id: z.string().min(1),
  resourceType: z.enum(characterProfileImpactResourceTypes),
  resourceId: z.string().min(1),
  title: z.string().min(1),
  field: z.string().min(1),
  before: z.string(),
  evidence: z.string().min(1),
  updatedAt: z.string().min(1),
  applyMode: z.enum(["replace", "review"]),
  paragraphs: z.array(characterProfileImpactParagraphSchema).max(12).optional(),
}).strict();

export type CharacterProfileImpactCandidate = z.infer<typeof characterProfileImpactCandidateSchema>;

export const characterProfileImpactSuggestionSchema = z.object({
  candidateId: z.string().min(1),
  resourceType: z.enum(characterProfileImpactResourceTypes),
  resourceId: z.string().min(1),
  title: z.string().min(1),
  field: z.string().min(1),
  before: z.string(),
  after: z.string().nullable(),
  updatedAt: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  applyMode: z.enum(["replace", "review"]),
  paragraphs: z.array(characterProfileImpactParagraphSchema).max(12).optional(),
}).strict();

export type CharacterProfileImpactSuggestion = z.infer<typeof characterProfileImpactSuggestionSchema>;

export const characterProfileImpactRequestSchema = z.object({
  changes: characterProfileSaveSchema.shape.changes,
}).strict();

export type CharacterProfileImpactRequest = z.infer<typeof characterProfileImpactRequestSchema>;

export const characterProfileImpactApplySchema = characterProfileImpactRequestSchema.extend({
  expectedCharacterUpdatedAt: z.string().min(1),
  suggestions: z.array(characterProfileImpactSuggestionSchema).max(80).default([]),
}).strict();

export type CharacterProfileImpactApply = z.infer<typeof characterProfileImpactApplySchema>;

export interface CharacterProfileImpactApplyResult {
  appliedSuggestionCount: number;
  proseSuggestions: CharacterProfileImpactSuggestion[];
}

export interface CharacterProfileImpactPreview {
  character: {
    id: string;
    name: string;
    before: CharacterProfileDraft;
    after: CharacterProfileDraft;
    updatedAt: string;
  };
  candidates: CharacterProfileImpactCandidate[];
  suggestions: CharacterProfileImpactSuggestion[];
  prompt: {id: string; version: string; provider: string; model: string} | null;
}

export const characterProfileImpactFields = characterProfileFields;
