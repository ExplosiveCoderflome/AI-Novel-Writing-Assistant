import { z } from "zod";

export const characterForwardFieldNames = ["currentState", "currentGoal", "development"] as const;
export const characterForwardFieldLabels = {
  currentState: "当前状态",
  currentGoal: "行动目标",
  development: "成长弧",
} as const;

const field = z.string().trim().max(4000).nullable().transform(value => value || null);
export const characterForwardFieldsSchema = z.object({
  currentState: field,
  currentGoal: field,
  development: field,
}).strict();

export const characterForwardApplySchema = z.object({
  effectiveFromChapterOrder: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  fields: characterForwardFieldsSchema.partial(),
}).strict();

export type CharacterForwardFields = z.infer<typeof characterForwardFieldsSchema>;
export type CharacterForwardApply = z.infer<typeof characterForwardApplySchema>;

export interface CharacterForwardPlanNotice {
  planId: string;
  chapterOrder: number;
  title: string;
  characterIds: string[];
}

export interface CharacterForwardPreview {
  effectiveFromChapterOrder: number;
  fingerprint: string;
  fields: CharacterForwardFields;
  blockedReason: string | null;
  affectedPlans: CharacterForwardPlanNotice[];
}
