import { z } from "zod";

export const payoffLedgerSyncSourceRefSchema = z.object({
  kind: z.enum(["major_payoff", "volume_open_payoff", "chapter_payoff_ref", "foreshadow_state", "open_conflict", "audit_issue"]),
  refId: z.string().trim().optional().nullable(),
  refLabel: z.string().trim().min(1),
  chapterId: z.string().trim().optional().nullable(),
  chapterOrder: z.number().int().optional().nullable(),
  volumeId: z.string().trim().optional().nullable(),
  volumeSortOrder: z.number().int().optional().nullable(),
});

export const payoffLedgerSyncEvidenceSchema = z.object({
  summary: z.string().trim().min(1),
  chapterId: z.string().trim().optional().nullable(),
  chapterOrder: z.number().int().optional().nullable(),
});

export const payoffLedgerSyncRiskSignalSchema = z.object({
  code: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string().trim().min(1),
});

export const payoffLedgerSyncItemSchema = z.object({
  ledgerKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  scopeType: z.enum(["book", "volume", "chapter"]),
  currentStatus: z.enum(["setup", "hinted", "pending_payoff", "paid_off", "failed", "overdue"]),
  targetStartChapterOrder: z.number().int().optional().nullable(),
  targetEndChapterOrder: z.number().int().optional().nullable(),
  firstSeenChapterOrder: z.number().int().optional().nullable(),
  lastTouchedChapterOrder: z.number().int().optional().nullable(),
  setupChapterId: z.string().trim().optional().nullable(),
  setupChapterOrder: z.number().int().optional().nullable(),
  payoffChapterId: z.string().trim().optional().nullable(),
  payoffChapterOrder: z.number().int().optional().nullable(),
  sourceRefs: z.array(payoffLedgerSyncSourceRefSchema).default([]),
  evidence: z.array(payoffLedgerSyncEvidenceSchema).default([]),
  riskSignals: z.array(payoffLedgerSyncRiskSignalSchema).default([]),
  statusReason: z.string().trim().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export const payoffLedgerSyncOutputSchema = z.object({
  items: z.array(payoffLedgerSyncItemSchema),
});
