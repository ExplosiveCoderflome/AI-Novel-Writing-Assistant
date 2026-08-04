import { z } from "zod";
import { auditSeveritySchema } from "./qualitySchemas.js";

const payoffLedgerScopeTypeSchema = z.enum(["book", "volume", "chapter"]);
const payoffLedgerStatusSchema = z.enum(["setup", "hinted", "pending_payoff", "paid_off", "failed", "overdue"]);

export const runtimePayoffLedgerSourceRefSchema = z.object({
  kind: z.enum(["major_payoff", "volume_open_payoff", "chapter_payoff_ref", "foreshadow_state", "open_conflict", "audit_issue"]),
  refId: z.string().nullable().optional(),
  refLabel: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  volumeId: z.string().nullable().optional(),
  volumeSortOrder: z.number().int().nullable().optional(),
});

export const runtimePayoffLedgerEvidenceSchema = z.object({
  summary: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
});

export const runtimePayoffLedgerRiskSignalSchema = z.object({
  code: z.string(),
  severity: auditSeveritySchema,
  summary: z.string(),
  stale: z.boolean().optional(),
});

export const runtimePayoffLedgerItemSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  ledgerKey: z.string(),
  title: z.string(),
  summary: z.string(),
  scopeType: payoffLedgerScopeTypeSchema,
  currentStatus: payoffLedgerStatusSchema,
  targetStartChapterOrder: z.number().int().nullable().optional(),
  targetEndChapterOrder: z.number().int().nullable().optional(),
  firstSeenChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterId: z.string().nullable().optional(),
  setupChapterId: z.string().nullable().optional(),
  payoffChapterId: z.string().nullable().optional(),
  lastSnapshotId: z.string().nullable().optional(),
  sourceRefs: z.array(runtimePayoffLedgerSourceRefSchema).default([]),
  evidence: z.array(runtimePayoffLedgerEvidenceSchema).default([]),
  riskSignals: z.array(runtimePayoffLedgerRiskSignalSchema).default([]),
  statusReason: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimePayoffLedgerSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  urgentCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  paidOffCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  updatedAt: z.string().nullable().optional(),
});

export type RuntimePayoffLedgerSourceRef = z.infer<typeof runtimePayoffLedgerSourceRefSchema>;
export type RuntimePayoffLedgerEvidence = z.infer<typeof runtimePayoffLedgerEvidenceSchema>;
export type RuntimePayoffLedgerRiskSignal = z.infer<typeof runtimePayoffLedgerRiskSignalSchema>;
export type RuntimePayoffLedgerItem = z.infer<typeof runtimePayoffLedgerItemSchema>;
export type RuntimePayoffLedgerSummary = z.infer<typeof runtimePayoffLedgerSummarySchema>;
