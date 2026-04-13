import { z } from "zod";
import type { BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import {
  toolCountSchema,
  toolListLimitSchema,
  toolNullableTextSchema,
  toolOptionalTextSchema,
  toolProgressSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
  toolTimestampSchema,
} from "./toolSchemaPrimitives";

const BOOK_ANALYSIS_STATUS_VALUES = [
  "draft",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "archived",
] as const satisfies readonly BookAnalysisStatus[];

export const bookAnalysisStatusSchema = z.enum(BOOK_ANALYSIS_STATUS_VALUES);

export const listBookAnalysesInputSchema = z.object({
  documentId: toolOptionalTextSchema,
  status: bookAnalysisStatusSchema.optional(),
  limit: toolListLimitSchema,
});

export const bookAnalysisSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  status: bookAnalysisStatusSchema,
  progress: toolProgressSchema,
  currentStage: toolNullableTextSchema,
  lastError: toolNullableTextSchema,
  updatedAt: toolTimestampSchema,
});

export const listBookAnalysesOutputSchema = z.object({
  items: z.array(bookAnalysisSummarySchema),
  summary: toolSummarySchema,
});

export const bookAnalysisIdInputSchema = z.object({
  analysisId: toolRequiredIdSchema,
});

export const getBookAnalysisDetailOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  status: bookAnalysisStatusSchema,
  summary: toolNullableTextSchema,
  progress: toolProgressSchema,
  currentStage: toolNullableTextSchema,
  currentItemLabel: toolNullableTextSchema,
  lastError: toolNullableTextSchema,
  sectionCount: toolCountSchema,
  updatedAt: toolTimestampSchema,
});

export const getBookAnalysisFailureReasonOutputSchema = z.object({
  analysisId: z.string(),
  status: bookAnalysisStatusSchema,
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  summary: toolSummarySchema,
});
