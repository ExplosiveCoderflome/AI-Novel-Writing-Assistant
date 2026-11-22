import { z } from "zod";

export const reviewVersion = z.string().regex(/^[a-f0-9]{64}$/);
export const finalFinding = z
  .object({
    paragraph: z.number().int().positive(),
    quote: z.string().trim().min(1).max(600),
    problem: z.string().trim().min(1).max(1200),
    advice: z.string().trim().min(1).max(1200),
  })
  .strict();
export const chapterInspection = z.object({ findings: z.array(finalFinding).max(12) }).strict();
export type FinalFinding = z.infer<typeof finalFinding>;
export interface FinalChapter {
  id: string;
  order: number;
  title: string;
  content: string;
  sourceHash: string;
  findings: FinalFinding[] | null;
}
export interface FinalReview {
  version: string;
  confirmedVersion: string | null;
  chapters: FinalChapter[];
}
export const finalApproval = z
  .object({
    version: reviewVersion,
    edits: z
      .array(z.object({ chapterId: z.string().min(1), content: z.string().refine((s) => !!s.trim()) }).strict())
      .refine((rows) => new Set(rows.map((row) => row.chapterId)).size === rows.length),
  })
  .strict();
export type FinalApproval = z.infer<typeof finalApproval>;
