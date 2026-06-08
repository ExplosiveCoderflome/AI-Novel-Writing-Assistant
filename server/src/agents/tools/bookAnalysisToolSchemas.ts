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

// ─── analyze_quality_debt_attribution ─────────────────────────���─────────────

export const analyzeQualityDebtAttributionInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1).optional().describe("起始章节序号，默认 1"),
  endOrder: z.number().int().min(1).optional().describe("结束章节序号，默认全部"),
});

export const qualityDebtChapterAttributionSchema = z.object({
  chapterOrder: toolCountSchema,
  chapterId: z.string(),
  title: z.string(),
  firstFailureIssueCodes: z.array(z.string()),
  secondFailureIssueCodes: z.array(z.string()),
  firstFailureClassificationCode: z.string().nullable(),
  patchAnchorFailed: z.boolean(),
  sameObligationRepeated: z.boolean(),
  planMisaligned: z.boolean(),
  lengthVsContentDrift: z.boolean(),
  missingObligationKinds: z.array(z.string()),
  /** 推断的主要根因标签 */
  primaryRootCause: z.enum(["A", "B", "D", "E", "unknown"]),
});

export const analyzeQualityDebtAttributionOutputSchema = z.object({
  novelId: z.string(),
  checkedRange: z.string(),
  totalDeferredChapters: toolCountSchema,
  /** 有归因数据的章节数（无归因 = 旧数据，修复前生成） */
  attributedChapters: toolCountSchema,
  /** 根因占比（0~1，仅计有归因章节） */
  rootCauseRatios: z.object({
    A: z.number().describe("开环修复：同义务重复失败"),
    B: z.number().describe("patch 锚点失配"),
    D: z.number().describe("义务不可达 / 计划错位"),
    E: z.number().describe("签名漂移：length→content"),
    unknown: z.number().describe("无法归因"),
  }),
  /** 最常见失败 issue code TOP5 */
  topFailureIssueCodes: z.array(z.object({
    code: z.string(),
    count: toolCountSchema,
  })),
  /** 最常见缺失义务种类 TOP3 */
  topMissingObligationKinds: z.array(z.object({
    kind: z.string(),
    count: toolCountSchema,
  })),
  /** 每个 deferred 章节的归因明细 */
  chapters: z.array(qualityDebtChapterAttributionSchema),
  /** 决策建议 */
  recommendation: toolSummarySchema,
});
