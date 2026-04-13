import { z } from "zod";
import {
  toolCountSchema,
  toolDryRunSchema,
  toolNullableTimestampSchema,
  toolOptionalIdSchema,
  toolOptionalTextSchema,
  toolRequiredIdSchema,
  toolRequiredTextSchema,
  toolSummarySchema,
} from "./toolSchemaPrimitives";

export const chapterPatchModeSchema = z.enum(["append", "replace_segment", "full_replace"]);

export const diffChapterPatchInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterId: toolRequiredIdSchema,
  mode: chapterPatchModeSchema.default("append"),
  content: toolRequiredTextSchema,
  marker: toolOptionalTextSchema,
});

export const diffChapterPatchOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: chapterPatchModeSchema,
  beforeLength: toolCountSchema,
  afterLength: toolCountSchema,
  summary: toolSummarySchema,
  beforePreview: z.string(),
  afterPreview: z.string(),
});

export const saveChapterDraftInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterId: toolRequiredIdSchema,
  content: toolRequiredTextSchema,
  title: toolOptionalTextSchema,
  dryRun: toolDryRunSchema,
});

export const saveChapterDraftOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  contentLength: toolCountSchema,
  updatedAt: toolNullableTimestampSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
});

export const applyChapterPatchInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterId: toolRequiredIdSchema,
  mode: chapterPatchModeSchema.default("append"),
  content: toolRequiredTextSchema,
  marker: toolOptionalTextSchema,
  chapterIds: z.array(toolRequiredIdSchema).optional(),
  worldRuleChange: z.boolean().optional(),
  worldId: toolOptionalIdSchema,
  dryRun: toolDryRunSchema,
});

export const applyChapterPatchOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: chapterPatchModeSchema,
  contentLength: toolCountSchema,
  updatedAt: toolNullableTimestampSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
  beforePreview: z.string(),
  afterPreview: z.string(),
});

export const previewPipelineRunInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
});

export const previewPipelineRunOutputSchema = z.object({
  novelId: z.string(),
  startOrder: toolCountSchema,
  endOrder: toolCountSchema,
  chapterCount: toolCountSchema,
  chapterIds: z.array(z.string()),
});

export const queuePipelineRunInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  maxRetries: z.number().int().min(0).max(5).optional(),
  dryRun: toolDryRunSchema,
});

export const queuePipelineRunOutputSchema = z.object({
  novelId: z.string(),
  jobId: z.string().nullable(),
  status: z.string(),
  startOrder: toolCountSchema,
  endOrder: toolCountSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
});
