import { z } from "zod";

export const chapterEditorContinueCandidateSchema = z.object({
  label: z.string().trim().min(1).max(24),
  content: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(160).optional(),
  rationale: z.string().trim().min(1).max(220).optional(),
  riskNotes: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
  semanticTags: z.array(z.string().trim().min(1).max(24)).max(6).optional(),
});

export const chapterEditorContinuePreviewSchema = z.object({
  macroAlignmentNote: z.string().trim().min(1).max(220).optional(),
  candidates: z.array(chapterEditorContinueCandidateSchema).min(2).max(3),
});

export type ChapterEditorContinuePreviewParsed = z.infer<typeof chapterEditorContinuePreviewSchema>;
