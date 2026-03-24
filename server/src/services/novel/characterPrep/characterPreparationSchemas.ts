import { z } from "zod";
import type { CharacterCastRole } from "@ai-novel/shared/types/novel";

const nonEmptyString = z.string().trim().min(1);

const CHARACTER_CAST_ROLE_VALUES = [
  "protagonist",
  "antagonist",
  "ally",
  "foil",
  "mentor",
  "love_interest",
  "pressure_source",
  "catalyst",
] as const satisfies CharacterCastRole[];

const characterCastRoleEnum = z.enum(CHARACTER_CAST_ROLE_VALUES);

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

export const characterCastRoleSchema = z.string().trim().transform(normalizeCharacterCastRole).pipe(characterCastRoleEnum);

export const characterCastOptionMemberSchema = z.object({
  name: nonEmptyString,
  role: nonEmptyString,
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

export type CharacterCastOptionParsed = z.infer<typeof characterCastOptionSchema>;
export type CharacterCastOptionResponseParsed = z.infer<typeof characterCastOptionResponseSchema>;
