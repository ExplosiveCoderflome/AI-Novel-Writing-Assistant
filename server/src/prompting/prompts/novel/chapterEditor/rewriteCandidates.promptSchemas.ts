import { z } from "zod";

export const chapterEditorRewriteCandidateSchema = z.object({
  label: z.string().trim().min(1).max(24),
  content: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(160).optional(),
  semanticTags: z.array(z.string().trim().min(1).max(24)).max(6).optional(),
});

export const chapterEditorRewriteCandidatesSchema = z.object({
  candidates: z.array(chapterEditorRewriteCandidateSchema).min(2).max(3),
});

export type ChapterEditorRewriteCandidatesParsed = z.infer<typeof chapterEditorRewriteCandidatesSchema>;
