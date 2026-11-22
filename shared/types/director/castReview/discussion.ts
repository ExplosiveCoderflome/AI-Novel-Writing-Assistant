import { z } from "zod";
import { castReviewFields } from "../revision.js";

export const castFieldLabels = {
  personality: "性格设定", storyFunction: "故事作用", currentGoal: "行动目标",
} as const;
export type CastField = typeof castReviewFields[number];
export type CastDraft = Record<CastField, string>;
export const castDraftSchema = z.object({
  personality: z.string(), storyFunction: z.string(), currentGoal: z.string(),
}).strict();
const suggestion = z.object({
  field: z.enum(castReviewFields), value: z.string().trim().min(1).max(12000),
  reason: z.string().trim().min(1).max(1200),
}).strict();
export const castReplySchema = z.object({
  replyText: z.string().trim().min(1).max(8000),
  changes: z.array(suggestion).max(castReviewFields.length).refine(items =>
    new Set(items.map(item => item.field)).size === items.length, "每个字段只能提出一项修改。"),
}).strict();
export const castProposalChanges = z.array(suggestion.extend({ before: z.string() })).min(1).max(castReviewFields.length);
export type CastChange = z.infer<typeof castProposalChanges>[number];
export interface CastProposal { id: string; status: "proposed"; changes: CastChange[] }
export interface ConfirmedCastMember { name: string; role: string; fields: { label: string; value: string }[] }
