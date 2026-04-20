import { z } from "zod";
import type { QualityScore, ReviewIssue, AuditType } from "@ai-novel/shared/types/novel";

const qualityScorePartialSchema = z.object({
  coherence: z.number().min(0).max(100).optional(),
  repetition: z.number().min(0).max(100).optional(),
  pacing: z.number().min(0).max(100).optional(),
  voice: z.number().min(0).max(100).optional(),
  engagement: z.number().min(0).max(100).optional(),
  overall: z.number().min(0).max(100).optional(),
});

function normalizeReviewIssueCategory(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "plot") {
    return "logic";
  }
  return normalized;
}

export const reviewIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.preprocess(
    normalizeReviewIssueCategory,
    z.enum(["coherence", "repetition", "pacing", "voice", "engagement", "logic"]),
  ),
  evidence: z.string().trim().min(1),
  fixSuggestion: z.string().trim().min(1),
});

const auditIssueOutputSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  fixSuggestion: z.string().trim().min(1),
});

const auditReportOutputSchema = z.object({
  auditType: z.enum(["continuity", "character", "plot", "mode_fit"]).transform((v) => v as AuditType),
  overallScore: z.number().min(0).max(100).optional(),
  summary: z.string().trim().optional(),
  issues: z.array(auditIssueOutputSchema).optional().default([]),
});

// 用于 AuditService / NovelCoreService review 两处：严格校验 LLM 输出可通过性。
export const fullAuditOutputSchema = z.object({
  score: qualityScorePartialSchema.optional(),
  issues: z.array(reviewIssueSchema).optional().default([]),
  auditReports: z.array(auditReportOutputSchema).optional().default([]),
});

export type FullAuditOutput = z.infer<typeof fullAuditOutputSchema>;
export type ReviewOutput = FullAuditOutput;

