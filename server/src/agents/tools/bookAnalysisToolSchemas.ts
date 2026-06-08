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

export const auditChapterContinuityInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1).optional().describe("起始章节序号，默认 1"),
  endOrder: z.number().int().min(1).optional().describe("结束章节序号，默认小说最后一章"),
});

export const continuityMilestoneBreakSchema = z.object({
  chapterOrder: toolCountSchema,
  milestone: z.string(),
  issue: z.string(),
});

export const continuitySubplotResetSchema = z.object({
  subplot: z.string(),
  resetAtChapterOrder: toolCountSchema,
  previousState: z.string(),
});

export const continuityRepetitionClusterSchema = z.object({
  pattern: z.string(),
  occurrences: z.array(toolCountSchema),
});

export const auditChapterContinuityOutputSchema = z.object({
  novelId: z.string(),
  checkedRange: z.string(),
  chapterCount: toolCountSchema,
  milestoneBreaks: z.array(continuityMilestoneBreakSchema),
  repetitionClusters: z.array(continuityRepetitionClusterSchema),
  openingPatternClusters: z.array(continuityRepetitionClusterSchema),
  hasCriticalIssues: z.boolean(),
  summary: toolSummarySchema,
  recommendation: toolSummarySchema,
});
