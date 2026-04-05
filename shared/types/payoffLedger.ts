export type PayoffLedgerScopeType = "book" | "volume" | "chapter";

export type PayoffLedgerStatus = "setup" | "hinted" | "pending_payoff" | "paid_off" | "failed" | "overdue";

export interface PayoffLedgerSourceRef {
  kind: "major_payoff" | "volume_open_payoff" | "chapter_payoff_ref" | "foreshadow_state" | "open_conflict" | "audit_issue";
  refId?: string | null;
  refLabel: string;
  chapterId?: string | null;
  chapterOrder?: number | null;
  volumeId?: string | null;
  volumeSortOrder?: number | null;
}

export interface PayoffLedgerEvidence {
  summary: string;
  chapterId?: string | null;
  chapterOrder?: number | null;
}

export interface PayoffLedgerRiskSignal {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  stale?: boolean;
}

export interface PayoffLedgerItem {
  id: string;
  novelId: string;
  ledgerKey: string;
  title: string;
  summary: string;
  scopeType: PayoffLedgerScopeType;
  currentStatus: PayoffLedgerStatus;
  targetStartChapterOrder?: number | null;
  targetEndChapterOrder?: number | null;
  firstSeenChapterOrder?: number | null;
  lastTouchedChapterOrder?: number | null;
  lastTouchedChapterId?: string | null;
  setupChapterId?: string | null;
  payoffChapterId?: string | null;
  lastSnapshotId?: string | null;
  sourceRefs: PayoffLedgerSourceRef[];
  evidence: PayoffLedgerEvidence[];
  riskSignals: PayoffLedgerRiskSignal[];
  statusReason?: string | null;
  confidence?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoffLedgerSummary {
  totalCount: number;
  pendingCount: number;
  urgentCount: number;
  overdueCount: number;
  paidOffCount: number;
  failedCount: number;
  updatedAt?: string | null;
}

export interface PayoffLedgerResponse {
  summary: PayoffLedgerSummary;
  items: PayoffLedgerItem[];
  updatedAt?: string | null;
}
