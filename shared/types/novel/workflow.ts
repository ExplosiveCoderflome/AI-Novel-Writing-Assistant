import type { AuditIssueStatus, AuditType } from "./core";
import type { StoryPlan } from "./volume";

export interface ReplanResult {
  primaryPlan: StoryPlan;
  generatedPlans: StoryPlan[];
  affectedChapterIds: string[];
  affectedChapterOrders: number[];
  anchorChapterOrder?: number | null;
  sourceIssueIds: string[];
  triggerType: string;
  reason: string;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
  windowSize: number;
  blockingLedgerKeys?: string[];
  run: {
    id: string;
    outputSummary?: string | null;
    createdAt: string;
  } | null;
}

export interface ReplanRecommendation {
  recommended: boolean;
  reason: string;
  blockingIssueIds: string[];
  blockingLedgerKeys?: string[];
  affectedChapterOrders?: number[];
  anchorChapterOrder?: number | null;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
}

export interface AuditIssue {
  id: string;
  reportId: string;
  auditType: AuditType;
  severity: "low" | "medium" | "high" | "critical";
  code: string;
  description: string;
  evidence: string;
  fixSuggestion: string;
  status: AuditIssueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuditReport {
  id: string;
  novelId: string;
  chapterId: string;
  auditType: AuditType;
  overallScore?: number | null;
  summary?: string | null;
  legacyScoreJson?: string | null;
  issues: AuditIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface CreativeDecision {
  id: string;
  novelId: string;
  chapterId?: string | null;
  category: string;
  content: string;
  importance: string;
  expiresAt?: number | null;
  sourceType?: string | null;
  sourceRefId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlotBeat {
  id: string;
  novelId: string;
  chapterOrder?: number | null;
  beatType: string;
  title: string;
  content: string;
  status: "planned" | "completed" | "skipped";
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}
