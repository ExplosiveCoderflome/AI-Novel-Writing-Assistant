import { createHash } from "crypto";
import type {
  DirectorAutoExecutionState,
  DirectorQualityLoopBudgetAttemptAction,
  DirectorQualityLoopBudgetEntry,
  DirectorQualityLoopBudgetLedger,
  DirectorQualityLoopBudgetNextAction,
  DirectorQualityLoopBudgetWindow,
} from "@ai-novel/shared/types/novelDirector";

export const DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS = {
  /** patch 预算提升到 2：首次锚点失配后允许一次宽松锚点重试（Root B）*/
  patchRepair: 2,
  chapterRewrite: 1,
  windowReplan: 1,
} as const;

const MAX_QUALITY_LEDGER_ENTRIES = 80;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/第\s*\d+\s*章/g, "第#章")
    .replace(/chapter[-_:\s]*[a-z0-9-]+/gi, "chapter#")
    .replace(/[a-z0-9]{16,}/gi, "#id")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function stableNumberList(values: Array<number | null | undefined> | null | undefined): number[] {
  return Array.from(new Set(
    (values ?? [])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.round(value)),
  )).sort((left, right) => left - right);
}

function stableStringList(values: Array<string | null | undefined> | null | undefined): string[] {
  return Array.from(new Set(
    (values ?? [])
      .map((value) => normalizeText(value))
      .filter(Boolean),
  )).sort();
}

export function buildDirectorQualityLoopBudgetWindow(input: {
  autoExecution: DirectorAutoExecutionState;
  chapterId?: string | null;
  chapterOrder?: number | null;
}): DirectorQualityLoopBudgetWindow {
  const startOrder = typeof input.autoExecution.startOrder === "number"
    ? input.autoExecution.startOrder
    : null;
  const endOrder = typeof input.autoExecution.endOrder === "number"
    ? input.autoExecution.endOrder
    : startOrder;
  if (startOrder != null && endOrder != null) {
    return {
      startOrder,
      endOrder,
      chapterOrders: [],
      chapterIds: [],
    };
  }
  return {
    startOrder,
    endOrder,
    chapterOrders: stableNumberList([
      input.chapterOrder ?? input.autoExecution.nextChapterOrder ?? null,
    ]),
    chapterIds: stableStringList([
      input.chapterId ?? input.autoExecution.nextChapterId ?? null,
    ]),
  };
}

/**
 * 将 noticeCode 归类为 length 类或 content 类。
 *
 * Root E 修复：长度问题（LENGTH_OVER_*、LENGTH_UNDER_*）与内容问题分属不同签名命名空间，
 * 补丁修好长度后浮出内容问题时，两者不再共用预算计数，避免签名漂移导致误升级。
 */
function classifyIssueNoticeCode(noticeCode: string | null | undefined): "length" | "content" {
  const code = (noticeCode ?? "").toUpperCase().trim();
  return code.startsWith("LENGTH_") ? "length" : "content";
}

export function buildDirectorQualityLoopIssueSignature(input: {
  reason?: string | null;
  noticeCode?: string | null;
  riskLevel?: string | null;
  repairMode?: string | null;
}): string {
  const issueClass = classifyIssueNoticeCode(input.noticeCode);
  return [
    issueClass,
    normalizeText(input.noticeCode) || "quality_loop",
    normalizeText(input.riskLevel) || "risk_unknown",
    normalizeText(input.repairMode) || "repair_unknown",
    normalizeText(input.reason) || "reason_unknown",
  ].join("|");
}

function normalizeWindow(window: DirectorQualityLoopBudgetWindow): DirectorQualityLoopBudgetWindow {
  return {
    startOrder: typeof window.startOrder === "number" ? Math.round(window.startOrder) : null,
    endOrder: typeof window.endOrder === "number" ? Math.round(window.endOrder) : null,
    chapterOrders: stableNumberList(window.chapterOrders),
    chapterIds: stableStringList(window.chapterIds),
  };
}

export function buildDirectorQualityLoopBudgetSignatureKey(input: {
  novelId: string;
  taskId: string;
  issueSignature: string;
  blockingLedgerKeys?: string[];
  affectedChapterWindow: DirectorQualityLoopBudgetWindow;
}): string {
  const payload = JSON.stringify({
    novelId: input.novelId,
    taskId: input.taskId,
    issueSignature: normalizeText(input.issueSignature),
    blockingLedgerKeys: stableStringList(input.blockingLedgerKeys),
    affectedChapterWindow: normalizeWindow(input.affectedChapterWindow),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function resolveDirectorQualityLoopBudgetNextAction(
  entry: DirectorQualityLoopBudgetEntry | null | undefined,
): DirectorQualityLoopBudgetNextAction {
  if ((entry?.deferredCount ?? 0) > 0) {
    return "defer_and_continue";
  }
  if ((entry?.windowReplanCount ?? 0) >= DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.windowReplan) {
    return "defer_and_continue";
  }
  if ((entry?.chapterRewriteCount ?? 0) >= DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.chapterRewrite) {
    return "auto_replan_window";
  }
  if ((entry?.patchRepairCount ?? 0) >= DIRECTOR_QUALITY_LOOP_BUDGET_LIMITS.patchRepair) {
    return "auto_rewrite_chapter";
  }
  return "auto_patch_repair";
}

function incrementAction(
  entry: DirectorQualityLoopBudgetEntry,
  action: DirectorQualityLoopBudgetAttemptAction,
): DirectorQualityLoopBudgetEntry {
  if (action === "patch_repair") {
    return { ...entry, patchRepairCount: entry.patchRepairCount + 1 };
  }
  if (action === "chapter_rewrite") {
    return { ...entry, chapterRewriteCount: entry.chapterRewriteCount + 1 };
  }
  if (action === "window_replan") {
    return { ...entry, windowReplanCount: entry.windowReplanCount + 1 };
  }
  return { ...entry, deferredCount: entry.deferredCount + 1 };
}

function emptyLedgerEntry(input: {
  signatureKey: string;
  issueSignature: string;
  blockingLedgerKeys?: string[];
  affectedChapterWindow: DirectorQualityLoopBudgetWindow;
  updatedAt: string;
}): DirectorQualityLoopBudgetEntry {
  return {
    signatureKey: input.signatureKey,
    issueSignature: normalizeText(input.issueSignature),
    blockingLedgerKeys: stableStringList(input.blockingLedgerKeys),
    affectedChapterWindow: normalizeWindow(input.affectedChapterWindow),
    patchRepairCount: 0,
    chapterRewriteCount: 0,
    windowReplanCount: 0,
    deferredCount: 0,
    updatedAt: input.updatedAt,
  };
}

export function findDirectorQualityLoopBudgetEntry(input: {
  state: DirectorAutoExecutionState;
  novelId: string;
  taskId: string;
  issueSignature: string;
  blockingLedgerKeys?: string[];
  affectedChapterWindow: DirectorQualityLoopBudgetWindow;
}): DirectorQualityLoopBudgetEntry | null {
  const signatureKey = buildDirectorQualityLoopBudgetSignatureKey(input);
  return input.state.qualityLoopLedger?.entries?.find((entry) => entry.signatureKey === signatureKey) ?? null;
}

export function recordDirectorQualityLoopBudgetAttempt(input: {
  state: DirectorAutoExecutionState;
  novelId: string;
  taskId: string;
  issueSignature: string;
  blockingLedgerKeys?: string[];
  affectedChapterWindow: DirectorQualityLoopBudgetWindow;
  action: DirectorQualityLoopBudgetAttemptAction;
  reason?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  occurredAt?: string | Date | null;
}): {
  state: DirectorAutoExecutionState;
  entry: DirectorQualityLoopBudgetEntry;
  nextAction: DirectorQualityLoopBudgetNextAction;
} {
  const updatedAt = input.occurredAt instanceof Date
    ? input.occurredAt.toISOString()
    : input.occurredAt ?? new Date().toISOString();
  const signatureKey = buildDirectorQualityLoopBudgetSignatureKey(input);
  const existingEntries = input.state.qualityLoopLedger?.entries ?? [];
  const existing = existingEntries.find((entry) => entry.signatureKey === signatureKey)
    ?? emptyLedgerEntry({
      signatureKey,
      issueSignature: input.issueSignature,
      blockingLedgerKeys: input.blockingLedgerKeys,
      affectedChapterWindow: input.affectedChapterWindow,
      updatedAt,
    });
  const updatedEntry = {
    ...incrementAction(existing, input.action),
    lastAction: input.action,
    lastReason: normalizeText(input.reason) || null,
    lastChapterId: input.chapterId ?? null,
    lastChapterOrder: typeof input.chapterOrder === "number" ? input.chapterOrder : null,
    updatedAt,
  };
  const entries = [
    ...existingEntries.filter((entry) => entry.signatureKey !== signatureKey),
    updatedEntry,
  ].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).slice(-MAX_QUALITY_LEDGER_ENTRIES);
  const ledger: DirectorQualityLoopBudgetLedger = {
    entries,
    updatedAt,
  };
  return {
    state: {
      ...input.state,
      qualityLoopLedger: ledger,
    },
    entry: updatedEntry,
    nextAction: resolveDirectorQualityLoopBudgetNextAction(updatedEntry),
  };
}
