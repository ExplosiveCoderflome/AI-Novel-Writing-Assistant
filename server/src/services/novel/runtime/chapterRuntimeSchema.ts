import { z } from "zod";
import { llmProviderSchema } from "../../../llm/providerSchema";

export const chapterRuntimeRequestSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  previousChaptersSummary: z.array(z.string()).optional(),
  taskStyleProfileId: z.string().trim().optional(),
});

export type ChapterRuntimeRequestInput = z.infer<typeof chapterRuntimeRequestSchema>;
