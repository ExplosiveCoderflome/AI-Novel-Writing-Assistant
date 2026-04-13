import { z } from "zod";
import {
  toolCountSchema,
  toolListLimitSchema,
  toolNullableTextSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
  toolTimestampSchema,
} from "./toolSchemaPrimitives";

export const listWorldsInputSchema = z.object({
  limit: toolListLimitSchema,
});

export const worldSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  worldType: toolNullableTextSchema,
  status: z.string(),
  version: toolCountSchema,
  overviewSummary: toolNullableTextSchema,
  updatedAt: toolTimestampSchema,
});

export const listWorldsOutputSchema = z.object({
  items: z.array(worldSummarySchema),
  summary: toolSummarySchema,
});

export const worldIdInputSchema = z.object({
  worldId: toolRequiredIdSchema,
});

export const bindWorldToNovelInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  worldId: toolRequiredIdSchema.optional(),
  worldName: toolRequiredIdSchema.optional(),
}).refine((input) => Boolean(input.worldId || input.worldName), {
  message: "worldId or worldName is required.",
});

export const unbindWorldFromNovelInputSchema = z.object({
  novelId: toolRequiredIdSchema,
});

export const getWorldDetailOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  worldType: toolNullableTextSchema,
  status: z.string(),
  version: toolCountSchema,
  overviewSummary: toolNullableTextSchema,
  consistencyReport: toolNullableTextSchema,
  novelCount: toolCountSchema,
  openIssueCount: toolCountSchema,
  summary: toolSummarySchema,
});

export const bindWorldToNovelOutputSchema = z.object({
  novelId: z.string(),
  novelTitle: z.string(),
  worldId: z.string(),
  worldName: z.string(),
  summary: toolSummarySchema,
});

export const unbindWorldFromNovelOutputSchema = z.object({
  novelId: z.string(),
  novelTitle: z.string(),
  previousWorldId: toolNullableTextSchema,
  previousWorldName: toolNullableTextSchema,
  worldId: toolNullableTextSchema,
  worldName: toolNullableTextSchema,
  summary: toolSummarySchema,
});

export const explainWorldConflictInputSchema = z.object({
  worldId: toolRequiredIdSchema,
  issueId: z.string().trim().optional(),
});

export const explainWorldConflictOutputSchema = z.object({
  worldId: z.string(),
  issueId: toolNullableTextSchema,
  issueCount: toolCountSchema,
  severity: toolNullableTextSchema,
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  summary: toolSummarySchema,
});
