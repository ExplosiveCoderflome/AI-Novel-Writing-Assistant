import { z } from "zod";
import type { DirectorCandidate } from "../novelDirector";

export const candidateStoryFields = [
  "logline", "positioning", "sellingPoint", "protagonistPath", "coreConflict",
  "hookStrategy", "progressionLoop", "endingDirection", "whyItFits",
] as const satisfies readonly (keyof DirectorCandidate)[];
export type CandidateStoryField = typeof candidateStoryFields[number];
export const candidateFieldLabel: Record<CandidateStoryField, string> = {
  logline: "一句话故事", positioning: "读者定位", sellingPoint: "故事卖点", protagonistPath: "主角成长",
  coreConflict: "核心冲突", hookStrategy: "开篇悬念", progressionLoop: "故事如何推进",
  endingDirection: "结局方向", whyItFits: "推荐理由",
};

const changeSchema = z.object({
  field: z.enum(candidateStoryFields), value: z.string().trim().min(1).max(3000),
  reason: z.string().trim().min(1).max(800),
}).strict();
export const candidateReplySchema = z.object({
  replyText: z.string().trim().min(1).max(6000),
  changes: z.array(changeSchema).max(candidateStoryFields.length)
    .refine(items => new Set(items.map(item => item.field)).size === items.length, "每个字段只能建议一次。"),
}).strict();
export const savedCandidateChanges = z.array(changeSchema.extend({ before: z.string() }));
export type CandidateReply = z.infer<typeof candidateReplySchema>;
export interface CandidateProposal {
  id: string;
  status: "pending" | "applied" | "superseded" | "stale";
  changes: z.infer<typeof savedCandidateChanges>;
  appliedFields: CandidateStoryField[];
}
