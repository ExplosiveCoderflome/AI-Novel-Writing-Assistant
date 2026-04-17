import { z } from "zod";

export const chapterEditorUserIntentSchema = z.object({
  editGoal: z.string().trim().min(1).max(80),
  toneShift: z.string().trim().min(1).max(80),
  paceAdjustment: z.string().trim().min(1).max(80),
  conflictAdjustment: z.string().trim().min(1).max(80),
  emotionAdjustment: z.string().trim().min(1).max(80),
  mustPreserve: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  mustAvoid: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  strength: z.enum(["light", "medium", "strong"]),
  reasoningSummary: z.string().trim().min(1).max(220),
});

export type ChapterEditorUserIntentParsed = z.infer<typeof chapterEditorUserIntentSchema>;
