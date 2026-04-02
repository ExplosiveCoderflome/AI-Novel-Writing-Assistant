import { z } from "zod";
import type {
  CharacterCastRole,
  CharacterGender,
  SupplementalCharacterGenerationMode,
} from "@ai-novel/shared/types/novel";

const nonEmptyString = z.string().trim().min(1);

export const CHARACTER_CAST_ROLE_VALUES = [
  "protagonist",
  "antagonist",
  "ally",
  "foil",
  "mentor",
  "love_interest",
  "pressure_source",
  "catalyst",
] as const satisfies CharacterCastRole[];

export const CHARACTER_GENDER_VALUES = [
  "male",
  "female",
  "other",
  "unknown",
] as const satisfies CharacterGender[];

const SUPPLEMENTAL_CHARACTER_GENERATION_MODE_VALUES = [
  "linked",
  "independent",
  "auto",
] as const satisfies SupplementalCharacterGenerationMode[];

const characterCastRoleEnum = z.enum(CHARACTER_CAST_ROLE_VALUES);
const characterGenderEnum = z.enum(CHARACTER_GENDER_VALUES);
const supplementalCharacterGenerationModeEnum = z.enum(SUPPLEMENTAL_CHARACTER_GENERATION_MODE_VALUES);

function normalizeCharacterCastRole(raw: string): CharacterCastRole {
  const value = raw.trim().toLowerCase();
  switch (value) {
    case "protagonist":
    case "main_character":
    case "lead":
    case "hero":
    case "主角":
      return "protagonist";
    case "antagonist":
    case "villain":
    case "opponent":
    case "反派":
    case "对手":
      return "antagonist";
    case "ally":
    case "partner":
    case "friend":
    case "同伴":
    case "盟友":
      return "ally";
    case "foil":
    case "mirror":
    case "镜像角色":
    case "映照角色":
      return "foil";
    case "mentor":
    case "teacher":
    case "导师":
      return "mentor";
    case "love_interest":
    case "romance":
    case "情感线":
    case "感情线":
      return "love_interest";
    case "pressure_source":
    case "pressure":
    case "trigger":
    case "施压者":
    case "压力源":
      return "pressure_source";
    default:
      return "catalyst";
  }
}

function normalizeCharacterGender(raw: string): CharacterGender {
  const value = raw.trim().toLowerCase();
  switch (value) {
    case "male":
    case "man":
    case "boy":
    case "m":
    case "男":
    case "男性":
    case "公":
      return "male";
    case "female":
    case "woman":
    case "girl":
    case "f":
    case "女":
    case "女性":
    case "母":
      return "female";
    case "other":
    case "non_binary":
    case "nonbinary":
    case "nb":
    case "中性":
    case "双性":
    case "跨性别":
    case "其他":
      return "other";
    default:
      return "unknown";
  }
}

export const characterCastRoleSchema = z.string().trim().transform(normalizeCharacterCastRole).pipe(characterCastRoleEnum);
export const characterGenderSchema = z.string().trim().transform(normalizeCharacterGender).pipe(characterGenderEnum);

export const characterCastOptionMemberSchema = z.object({
  name: nonEmptyString,
  role: nonEmptyString,
  gender: characterGenderSchema,
  castRole: characterCastRoleSchema,
  relationToProtagonist: z.string().trim().optional().default(""),
  storyFunction: nonEmptyString,
  shortDescription: z.string().trim().optional().default(""),
  outerGoal: z.string().trim().optional().default(""),
  innerNeed: z.string().trim().optional().default(""),
  fear: z.string().trim().optional().default(""),
  wound: z.string().trim().optional().default(""),
  misbelief: z.string().trim().optional().default(""),
  secret: z.string().trim().optional().default(""),
  moralLine: z.string().trim().optional().default(""),
  firstImpression: z.string().trim().optional().default(""),
});

export const characterCastOptionRelationSchema = z.object({
  sourceName: nonEmptyString,
  targetName: nonEmptyString,
  surfaceRelation: nonEmptyString,
  hiddenTension: z.string().trim().optional().default(""),
  conflictSource: z.string().trim().optional().default(""),
  secretAsymmetry: z.string().trim().optional().default(""),
  dynamicLabel: z.string().trim().optional().default(""),
  nextTurnPoint: z.string().trim().optional().default(""),
});

export const characterCastOptionSchema = z.object({
  title: nonEmptyString,
  summary: nonEmptyString,
  whyItWorks: z.string().trim().optional().default(""),
  recommendedReason: z.string().trim().optional().default(""),
  members: z.array(characterCastOptionMemberSchema).min(3).max(6),
  relations: z.array(characterCastOptionRelationSchema).min(2).max(12),
});

export const characterCastOptionResponseSchema = z.object({
  options: z.array(characterCastOptionSchema).length(3),
});

export const supplementalCharacterRelationSchema = z.object({
  sourceName: nonEmptyString,
  targetName: nonEmptyString,
  surfaceRelation: nonEmptyString,
  hiddenTension: z.string().trim().optional().default(""),
  conflictSource: z.string().trim().optional().default(""),
  dynamicLabel: z.string().trim().optional().default(""),
  nextTurnPoint: z.string().trim().optional().default(""),
});

export const supplementalCharacterCandidateSchema = z.object({
  name: nonEmptyString,
  role: nonEmptyString,
  gender: characterGenderSchema,
  castRole: characterCastRoleSchema,
  summary: nonEmptyString,
  storyFunction: nonEmptyString,
  relationToProtagonist: z.string().trim().optional().default(""),
  personality: z.string().trim().optional().default(""),
  background: z.string().trim().optional().default(""),
  development: z.string().trim().optional().default(""),
  outerGoal: z.string().trim().optional().default(""),
  innerNeed: z.string().trim().optional().default(""),
  fear: z.string().trim().optional().default(""),
  wound: z.string().trim().optional().default(""),
  misbelief: z.string().trim().optional().default(""),
  secret: z.string().trim().optional().default(""),
  moralLine: z.string().trim().optional().default(""),
  firstImpression: z.string().trim().optional().default(""),
  currentState: z.string().trim().optional().default(""),
  currentGoal: z.string().trim().optional().default(""),
  whyNow: z.string().trim().optional().default(""),
  relations: z.array(supplementalCharacterRelationSchema).max(4).default([]),
});

export const supplementalCharacterGenerationInputSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  mode: supplementalCharacterGenerationModeEnum.optional().default("auto"),
  anchorCharacterIds: z.array(z.string().trim().min(1)).max(5).optional().default([]),
  targetCastRole: z.union([characterCastRoleEnum, z.literal("auto")]).optional().default("auto"),
  count: z.number().int().min(1).max(3).optional(),
  userPrompt: z.string().trim().max(2000).optional(),
});

export const supplementalCharacterGenerationResponseSchema = z.object({
  mode: supplementalCharacterGenerationModeEnum,
  recommendedCount: z.number().int().min(1).max(3),
  planningSummary: z.string().trim().optional().default(""),
  candidates: z.array(supplementalCharacterCandidateSchema).min(1).max(3),
});

export type CharacterCastOptionParsed = z.infer<typeof characterCastOptionSchema>;
export type CharacterCastOptionResponseParsed = z.infer<typeof characterCastOptionResponseSchema>;
export type SupplementalCharacterCandidateParsed = z.infer<typeof supplementalCharacterCandidateSchema>;
export type SupplementalCharacterGenerationInputParsed = z.infer<typeof supplementalCharacterGenerationInputSchema>;
export type SupplementalCharacterGenerationResponseParsed = z.infer<typeof supplementalCharacterGenerationResponseSchema>;
