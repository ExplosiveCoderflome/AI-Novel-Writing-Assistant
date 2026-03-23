import { z } from "zod";

export const chapterSummaryOutputSchema = z.object({
  summary: z.string().trim().min(1),
});

export type ChapterSummaryOutput = z.infer<typeof chapterSummaryOutputSchema>;

