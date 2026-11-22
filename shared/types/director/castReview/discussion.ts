import { z } from "zod";
import { fieldSuggestionSchemas } from "../review/fieldSuggestions.js";
import { castReviewFields } from "../revision.js";

export const castFieldLabels = {
  personality: "性格设定", storyFunction: "故事作用", currentGoal: "行动目标",
} as const;
export type CastField = typeof castReviewFields[number];
export type CastDraft = Record<CastField, string>;
export const castDraftSchema = z.object({
  personality: z.string(), storyFunction: z.string(), currentGoal: z.string(),
}).strict();
export const { reply: castReplySchema, changes: castProposalChanges } = fieldSuggestionSchemas(castReviewFields);
export type CastChange = z.infer<typeof castProposalChanges>[number];
export interface CastProposal { id: string; status: "proposed"; changes: CastChange[] }
export interface ConfirmedCastMember { name: string; role: string; fields: { label: string; value: string }[] }
