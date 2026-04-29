import { z } from "zod";
import { llmProviderSchema } from "../../../llm/providerSchema";

const chapterRuntimeControlPolicySchema = z.object({
  kickoffMode: z.enum(["manual_start", "director_start", "takeover_start"]),
  advanceMode: z.enum(["manual", "stage_review", "auto_to_ready", "auto_to_execution"]),
  reviewCheckpoints: z.array(z.string()).default([]),
  autoExecutionRange: z.object({
    mode: z.enum(["front10", "volume", "chapter_range"]),
    start: z.number().int().nullable().optional(),
    end: z.number().int().nullable().optional(),
    volumeOrder: z.number().int().nullable().optional(),
  }).nullable().optional(),
});

export const chapterRuntimeRequestSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  previousChaptersSummary: z.array(z.string()).optional(),
  taskStyleProfileId: z.string().trim().optional(),
  controlPolicy: chapterRuntimeControlPolicySchema.optional(),
});

export type ChapterRuntimeRequestInput = z.infer<typeof chapterRuntimeRequestSchema>;
