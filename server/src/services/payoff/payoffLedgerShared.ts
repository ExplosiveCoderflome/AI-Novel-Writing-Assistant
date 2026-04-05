import type {
  PayoffLedgerItem,
  PayoffLedgerResponse,
  PayoffLedgerRiskSignal,
  PayoffLedgerSourceRef,
  PayoffLedgerStatus,
  PayoffLedgerSummary,
} from "@ai-novel/shared/types/payoffLedger";

type PayoffLedgerRowLike = {
  id: string;
  novelId: string;
  ledgerKey: string;
  title: string;
  summary: string;
  scopeType: "book" | "volume" | "chapter";
  currentStatus: "setup" | "hinted" | "pending_payoff" | "paid_off" | "failed" | "overdue";
  targetStartChapterOrder: number | null;
  targetEndChapterOrder: number | null;
  firstSeenChapterOrder: number | null;
  lastTouchedChapterOrder: number | null;
  lastTouchedChapterId: string | null;
  setupChapterId: string | null;
  payoffChapterId: string | null;
  lastSnapshotId: string | null;
  sourceRefsJson: string | null;
  evidenceJson: string | null;
  riskSignalsJson: string | null;
  statusReason: string | null;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface SyntheticPayoffIssue {
  ledgerKey: string;
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence: string;
  fixSuggestion: string;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function serializeLedgerJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function dedupeRiskSignals(signals: PayoffLedgerRiskSignal[]): PayoffLedgerRiskSignal[] {
  const seen = new Set<string>();
  const results: PayoffLedgerRiskSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.code}:${signal.summary}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(signal);
  }
  return results;
}

export function appendStaleRiskSignal(
  signals: PayoffLedgerRiskSignal[],
  summary: string,
): PayoffLedgerRiskSignal[] {
  return dedupeRiskSignals([
    ...signals.filter((signal) => signal.code !== "sync_stale"),
    {
      code: "sync_stale",
      severity: "medium",
      summary,
      stale: true,
    },
  ]);
}

export function clearStaleRiskSignal(signals: PayoffLedgerRiskSignal[]): PayoffLedgerRiskSignal[] {
  return signals.filter((signal) => signal.code !== "sync_stale");
}

export function mapPayoffLedgerRow(row: PayoffLedgerRowLike): PayoffLedgerItem {
  return {
    id: row.id,
    novelId: row.novelId,
    ledgerKey: row.ledgerKey,
    title: row.title,
    summary: row.summary,
    scopeType: row.scopeType,
    currentStatus: row.currentStatus,
    targetStartChapterOrder: row.targetStartChapterOrder,
    targetEndChapterOrder: row.targetEndChapterOrder,
    firstSeenChapterOrder: row.firstSeenChapterOrder,
    lastTouchedChapterOrder: row.lastTouchedChapterOrder,
    lastTouchedChapterId: row.lastTouchedChapterId,
    setupChapterId: row.setupChapterId,
    payoffChapterId: row.payoffChapterId,
    lastSnapshotId: row.lastSnapshotId,
    sourceRefs: safeParseJson<PayoffLedgerSourceRef[]>(row.sourceRefsJson, []),
    evidence: safeParseJson(row.evidenceJson, []),
    riskSignals: safeParseJson<PayoffLedgerRiskSignal[]>(row.riskSignalsJson, []),
    statusReason: row.statusReason,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isPendingLike(status: PayoffLedgerStatus): boolean {
  return status === "setup" || status === "hinted" || status === "pending_payoff";
}

function isUrgent(item: PayoffLedgerItem, chapterOrder?: number | null): boolean {
  if (!chapterOrder || !isPendingLike(item.currentStatus)) {
    return false;
  }
  if (typeof item.targetEndChapterOrder === "number" && item.targetEndChapterOrder <= chapterOrder + 1) {
    return true;
  }
  if (typeof item.targetStartChapterOrder === "number" && item.targetStartChapterOrder <= chapterOrder) {
    return true;
  }
  return false;
}

export function classifyPayoffLedgerItems(
  items: PayoffLedgerItem[],
  chapterOrder?: number | null,
): {
  pendingItems: PayoffLedgerItem[];
  urgentItems: PayoffLedgerItem[];
  overdueItems: PayoffLedgerItem[];
  paidOffItems: PayoffLedgerItem[];
} {
  const overdueItems = items.filter((item) => item.currentStatus === "overdue");
  const pendingItems = items.filter((item) => isPendingLike(item.currentStatus));
  const urgentItems = pendingItems.filter((item) => isUrgent(item, chapterOrder));
  const paidOffItems = items.filter((item) => item.currentStatus === "paid_off");
  return {
    pendingItems,
    urgentItems,
    overdueItems,
    paidOffItems,
  };
}

export function buildPayoffLedgerSummary(
  items: PayoffLedgerItem[],
  chapterOrder?: number | null,
): PayoffLedgerSummary {
  const classified = classifyPayoffLedgerItems(items, chapterOrder);
  return {
    totalCount: items.length,
    pendingCount: classified.pendingItems.length,
    urgentCount: classified.urgentItems.length,
    overdueCount: classified.overdueItems.length,
    paidOffCount: classified.paidOffItems.length,
    failedCount: items.filter((item) => item.currentStatus === "failed").length,
    updatedAt: items[0]?.updatedAt ?? null,
  };
}

export function buildPayoffLedgerResponse(
  items: PayoffLedgerItem[],
  chapterOrder?: number | null,
): PayoffLedgerResponse {
  const orderedItems = items.slice().sort((left, right) => {
    const leftPriority = left.currentStatus === "overdue" ? 0 : left.currentStatus === "pending_payoff" ? 1 : left.currentStatus === "hinted" ? 2 : left.currentStatus === "setup" ? 3 : left.currentStatus === "paid_off" ? 4 : 5;
    const rightPriority = right.currentStatus === "overdue" ? 0 : right.currentStatus === "pending_payoff" ? 1 : right.currentStatus === "hinted" ? 2 : right.currentStatus === "setup" ? 3 : right.currentStatus === "paid_off" ? 4 : 5;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    const leftOrder = left.targetEndChapterOrder ?? left.lastTouchedChapterOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.targetEndChapterOrder ?? right.lastTouchedChapterOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title, "zh-Hans-CN");
  });
  return {
    summary: buildPayoffLedgerSummary(orderedItems, chapterOrder),
    items: orderedItems,
    updatedAt: orderedItems[0]?.updatedAt ?? null,
  };
}

export function buildSyntheticPayoffIssues(
  items: PayoffLedgerItem[],
  chapterOrder?: number | null,
): SyntheticPayoffIssue[] {
  const issues: SyntheticPayoffIssue[] = [];
  const classified = classifyPayoffLedgerItems(items, chapterOrder);

  for (const item of classified.overdueItems) {
    issues.push({
      ledgerKey: item.ledgerKey,
      code: "payoff_overdue",
      severity: "high",
      description: `伏笔“${item.title}”已经超过目标窗口仍未兑现。`,
      evidence: item.statusReason?.trim()
        || item.evidence[0]?.summary
        || `目标窗口截止第${item.targetEndChapterOrder ?? "?"}章，当前仍处于未兑现状态。`,
      fixSuggestion: "在当前章节或接下来的重规划中明确安排兑现，或解释为什么必须延后。",
    });
  }

  for (const item of classified.pendingItems) {
    if (chapterOrder && isUrgent(item, chapterOrder) && item.currentStatus !== "overdue") {
      issues.push({
        ledgerKey: item.ledgerKey,
        code: "payoff_missing_progress",
        severity: "medium",
        description: `伏笔“${item.title}”已经进入应触碰窗口，但当前仍缺少明确推进。`,
        evidence: item.statusReason?.trim()
          || item.evidence[0]?.summary
          || `目标窗口 ${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}。`,
        fixSuggestion: "在本章计划、正文或修复中补上推进动作，避免继续拖延。",
      });
    }
  }

  for (const item of items) {
    for (const signal of item.riskSignals) {
      if (
        signal.code !== "payoff_paid_without_setup"
        && signal.code !== "payoff_regressed"
        && signal.code !== "payoff_missing_progress"
      ) {
        continue;
      }
      issues.push({
        ledgerKey: item.ledgerKey,
        code: signal.code,
        severity: signal.severity,
        description: `伏笔“${item.title}”存在专项风险：${signal.summary}`,
        evidence: item.evidence[0]?.summary || item.summary,
        fixSuggestion: signal.code === "payoff_paid_without_setup"
          ? "补足前置铺垫，或将当前章节的兑现强度降回铺垫/推进态。"
          : signal.code === "payoff_regressed"
            ? "检查是否误把已兑现伏笔重新打开；如属新线索，请改成新的账本项。"
            : "为该伏笔补上明确推进动作，避免账本继续停滞。",
      });
    }
  }

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.ledgerKey}:${issue.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
