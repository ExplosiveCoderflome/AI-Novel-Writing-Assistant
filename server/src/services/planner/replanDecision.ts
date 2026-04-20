import type {
  ChapterStateGoal,
  GenerationNextAction,
  CanonicalStateSnapshot,
  CanonicalPayoffState,
} from "@ai-novel/shared/types/canonicalState";
import type {
  AuditIssue,
  AuditReport,
  ReplanRecommendation,
} from "@ai-novel/shared/types/novel";
import type { PayoffLedgerSummary } from "@ai-novel/shared/types/payoffLedger";

type ReplanSignal =
  | "overdue_payoff"
  | "next_action_replan"
  | "blocking_audit"
  | "urgent_payoff"
  | "manual_request"
  | "stable";

type WindowMode = "forward" | "surrounding";

export interface ReplanDecisionInput {
  requestedWindowSize?: number | null;
  availableChapterOrders?: number[] | null;
  targetChapterOrder?: number | null;
  triggerType?: string | null;
  reason?: string | null;
  sourceIssueIds?: string[] | null;
  blockingIssueIds?: string[] | null;
  blockingLedgerKeys?: string[] | null;
  auditReports?: AuditReport[] | null;
  ledgerSummary?: PayoffLedgerSummary | null;
  snapshot?: CanonicalStateSnapshot | null;
  nextAction?: GenerationNextAction | null;
  chapterStateGoal?: ChapterStateGoal | null;
  protectedSecrets?: string[] | null;
  forceRecommended?: boolean;
}

export interface ReplanDecision extends ReplanRecommendation {
  signal: ReplanSignal;
  triggerType: string;
  sourceIssueIds: string[];
  windowSize: number;
  blockingLedgerKeys: string[];
  affectedChapterOrders: number[];
  anchorChapterOrder: number | null;
  triggerReason: string;
  windowReason: string;
  whyTheseChapters: string;
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = String(item ?? "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniqueNumbers(items: Array<number | null | undefined>): number[] {
  return Array.from(new Set(
    items
      .filter((item): item is number => Number.isInteger(item))
      .map((item) => Number(item)),
  )).sort((left, right) => left - right);
}

function clampWindowSize(value?: number | null): number {
  return Math.max(1, Math.min(value ?? 3, 5));
}

function collectBlockingIssues(auditReports?: AuditReport[] | null): AuditIssue[] {
  return (auditReports ?? [])
    .flatMap((report) => report.issues)
    .filter((issue) => issue.status === "open" && (issue.severity === "high" || issue.severity === "critical"));
}

function collectBlockingLedgerKeys(
  explicitKeys: string[] | null | undefined,
  snapshot?: CanonicalStateSnapshot | null,
): string[] {
  const fromSnapshot = snapshot?.narrative.overduePayoffs.map((item) => item.ledgerKey) ?? [];
  return uniqueStrings([...(explicitKeys ?? []), ...fromSnapshot]);
}

function pickFallbackAnchor(input: ReplanDecisionInput): number | null {
  return input.targetChapterOrder
    ?? input.chapterStateGoal?.chapterOrder
    ?? input.snapshot?.narrative.currentChapterOrder
    ?? input.availableChapterOrders?.[input.availableChapterOrders.length - 1]
    ?? null;
}

function pickPayoffAnchor(
  payoffs: CanonicalPayoffState[],
  fields: Array<keyof CanonicalPayoffState>,
  fallback: number | null,
): number | null {
  for (const field of fields) {
    const candidates = uniqueNumbers(payoffs.map((item) => {
      const value = item[field];
      return typeof value === "number" ? value : null;
    }));
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return fallback;
}

function resolveAnchorChapterOrder(signal: ReplanSignal, input: ReplanDecisionInput): number | null {
  const fallbackAnchor = pickFallbackAnchor(input);
  if (signal === "overdue_payoff") {
    return pickPayoffAnchor(
      input.snapshot?.narrative.overduePayoffs ?? [],
      ["targetEndChapterOrder", "targetStartChapterOrder", "lastTouchedChapterOrder", "firstSeenChapterOrder"],
      fallbackAnchor,
    );
  }
  if (signal === "urgent_payoff") {
    return pickPayoffAnchor(
      input.snapshot?.narrative.urgentPayoffs ?? [],
      ["targetStartChapterOrder", "targetEndChapterOrder", "lastTouchedChapterOrder", "firstSeenChapterOrder"],
      fallbackAnchor,
    );
  }
  return fallbackAnchor;
}

function pickSignal(input: ReplanDecisionInput, blockingIssues: AuditIssue[], blockingLedgerKeys: string[]): ReplanSignal {
  const overdueCount = (input.ledgerSummary?.overdueCount ?? 0) + blockingLedgerKeys.length;
  if (overdueCount > 0) {
    return "overdue_payoff";
  }
  if (input.nextAction === "replan") {
    return "next_action_replan";
  }
  if (blockingIssues.length > 0) {
    return "blocking_audit";
  }
  if (
    input.nextAction === "advance_payoff"
    || (input.snapshot?.narrative.urgentPayoffs.length ?? 0) > 0
    || (input.ledgerSummary?.urgentCount ?? 0) > 0
  ) {
    return "urgent_payoff";
  }
  if (input.forceRecommended) {
    return "manual_request";
  }
  return "stable";
}

function resolveWindowMode(signal: ReplanSignal): WindowMode {
  return signal === "blocking_audit" || signal === "manual_request" ? "forward" : "surrounding";
}

function resolveDefaultWindowSize(signal: ReplanSignal): number {
  if (signal === "urgent_payoff") {
    return 2;
  }
  return 3;
}

function nearestAnchorIndex(availableChapterOrders: number[], anchorChapterOrder: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < availableChapterOrders.length; index += 1) {
    const distance = Math.abs(availableChapterOrders[index] - anchorChapterOrder);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildWindowOrders(
  anchorChapterOrder: number | null,
  availableChapterOrders: number[] | null | undefined,
  requestedWindowSize?: number | null,
  mode: WindowMode = "forward",
): number[] {
  const windowSize = clampWindowSize(requestedWindowSize);
  if (!anchorChapterOrder) {
    return [];
  }
  const normalizedOrders = uniqueNumbers(availableChapterOrders ?? []);
  if (normalizedOrders.length === 0) {
    const fallbackOrders = [anchorChapterOrder];
    if (mode === "surrounding") {
      let distance = 1;
      while (fallbackOrders.length < windowSize) {
        fallbackOrders.unshift(Math.max(1, anchorChapterOrder - distance));
        if (fallbackOrders.length >= windowSize) {
          break;
        }
        fallbackOrders.push(anchorChapterOrder + distance);
        distance += 1;
      }
      return uniqueNumbers(fallbackOrders).slice(0, windowSize);
    }
    for (let offset = 1; fallbackOrders.length < windowSize; offset += 1) {
      fallbackOrders.push(anchorChapterOrder + offset);
    }
    return fallbackOrders;
  }

  if (mode === "forward") {
    const fromAnchor = normalizedOrders.filter((order) => order >= anchorChapterOrder);
    if (fromAnchor.length >= windowSize) {
      return fromAnchor.slice(0, windowSize);
    }
    const beforeAnchor = normalizedOrders.filter((order) => order < anchorChapterOrder).reverse();
    const combined = [...fromAnchor];
    for (const order of beforeAnchor) {
      if (combined.length >= windowSize) {
        break;
      }
      combined.unshift(order);
    }
    return combined.slice(0, windowSize);
  }

  const anchorIndex = nearestAnchorIndex(normalizedOrders, anchorChapterOrder);
  const selected = [normalizedOrders[anchorIndex]];
  let left = anchorIndex - 1;
  let right = anchorIndex + 1;
  while (selected.length < windowSize && (left >= 0 || right < normalizedOrders.length)) {
    if (left >= 0) {
      selected.push(normalizedOrders[left]);
      left -= 1;
    }
    if (selected.length >= windowSize) {
      break;
    }
    if (right < normalizedOrders.length) {
      selected.push(normalizedOrders[right]);
      right += 1;
    }
  }
  return uniqueNumbers(selected).slice(0, windowSize);
}

function formatOrders(orders: number[]): string {
  return orders.map((order) => `第${order}章`).join("、");
}

function buildTriggerReason(signal: ReplanSignal, input: ReplanDecisionInput, blockingIssues: AuditIssue[], blockingLedgerKeys: string[]): string {
  if (signal === "overdue_payoff") {
    const titles = uniqueStrings((input.snapshot?.narrative.overduePayoffs ?? []).map((item) => item.title)).slice(0, 2);
    return titles.length > 0
      ? `canonical 状态显示 payoff 已逾期：${titles.join("；")}。`
      : `canonical 状态显示存在逾期 payoff，需要重排后续章节。`;
  }
  if (signal === "next_action_replan") {
    return `状态驱动决策已切到 replan，说明当前章节目标与现有计划窗口失配。`;
  }
  if (signal === "blocking_audit") {
    const topIssues = blockingIssues.slice(0, 2).map((issue) => issue.description);
    return topIssues.length > 0
      ? `高优先级审计问题未解决：${topIssues.join("；")}。`
      : `存在未解决的高优先级审计问题，需要先调整章节计划。`;
  }
  if (signal === "urgent_payoff") {
    const titles = uniqueStrings((input.snapshot?.narrative.urgentPayoffs ?? []).map((item) => item.title)).slice(0, 2);
    return titles.length > 0
      ? `当前章节窗口必须触碰紧急 payoff：${titles.join("；")}。`
      : `当前章节窗口存在需要优先推进的 payoff。`;
  }
  if (signal === "manual_request") {
    return input.reason?.trim() || "用户显式要求重规划当前窗口。";
  }
  if (blockingLedgerKeys.length > 0) {
    return `伏笔账本存在待处理风险，需要重新校准章节职责。`;
  }
  return "当前状态稳定，暂不建议重规划。";
}

function buildWindowReason(signal: ReplanSignal, anchorChapterOrder: number | null, affectedChapterOrders: number[], protectedSecrets: string[]): string {
  const chapterLabel = anchorChapterOrder ? `第${anchorChapterOrder}章` : "当前章";
  const secretHint = protectedSecrets.length > 0
    ? ` 同时要守住“${protectedSecrets.slice(0, 2).join("；")}”这类未公开信息。`
    : "";
  if (signal === "overdue_payoff") {
    return `以${chapterLabel}为锚点，窗口覆盖 ${formatOrders(affectedChapterOrders)}，因为逾期 payoff 往往需要补铺垫、兑现和兑现后的余波连续联动。${secretHint}`.trim();
  }
  if (signal === "blocking_audit") {
    return `以${chapterLabel}向后展开 ${formatOrders(affectedChapterOrders)}，先修正当前阻塞问题，再避免旧计划继续污染后续章节。${secretHint}`.trim();
  }
  if (signal === "next_action_replan") {
    return `以${chapterLabel}为锚点联动 ${formatOrders(affectedChapterOrders)}，让当前状态目标重新对齐邻近章节职责。${secretHint}`.trim();
  }
  if (signal === "urgent_payoff") {
    return `以${chapterLabel}为锚点覆盖 ${formatOrders(affectedChapterOrders)}，确保紧急 payoff 在有效窗口内被推进。${secretHint}`.trim();
  }
  if (signal === "manual_request") {
    return `本次按 ${formatOrders(affectedChapterOrders)} 执行手动重规划，优先围绕${chapterLabel}附近的连续章节收口。${secretHint}`.trim();
  }
  return `当前没有必须调整的窗口。`;
}

function buildWhyTheseChapters(signal: ReplanSignal, affectedChapterOrders: number[], chapterStateGoal?: ChapterStateGoal | null): string {
  if (affectedChapterOrders.length === 0) {
    return "当前没有选中的重规划章节。";
  }
  const ordersLabel = formatOrders(affectedChapterOrders);
  const goalHint = chapterStateGoal?.summary?.trim()
    ? `，并围绕“${chapterStateGoal.summary.trim()}”重新分配章节职责`
    : "";
  if (affectedChapterOrders.length === 1) {
    return `只调整${ordersLabel}，因为问题当前集中在单章范围内${goalHint}。`;
  }
  if (signal === "overdue_payoff") {
    return `选择${ordersLabel}，因为这组章节需要连续承担补铺垫、兑现逾期 payoff 和承接新盘面变化${goalHint}。`;
  }
  if (signal === "blocking_audit") {
    return `选择${ordersLabel}，因为高优先级问题已经进入当前章节，并会直接影响紧邻的后续推进${goalHint}。`;
  }
  if (signal === "next_action_replan") {
    return `选择${ordersLabel}，因为 canonical state 已判定现有窗口失配，需要从锚点章向前后联动收口${goalHint}。`;
  }
  if (signal === "urgent_payoff") {
    return `选择${ordersLabel}，因为这几个章节共同决定紧急 payoff 能否在有效窗口内落地${goalHint}。`;
  }
  return `选择${ordersLabel}，因为这些章节与当前状态目标直接相邻，调整成本最低${goalHint}。`;
}

export function buildReplanDecision(input: ReplanDecisionInput): ReplanDecision {
  const blockingIssues = collectBlockingIssues(input.auditReports);
  const blockingIssueIds = uniqueStrings([
    ...(input.blockingIssueIds ?? []),
    ...blockingIssues.map((issue) => issue.id),
  ]);
  const blockingLedgerKeys = collectBlockingLedgerKeys(input.blockingLedgerKeys, input.snapshot);
  const signal = pickSignal(input, blockingIssues, blockingLedgerKeys);
  const recommended = input.forceRecommended
    || signal === "overdue_payoff"
    || signal === "next_action_replan"
    || signal === "blocking_audit"
    || signal === "urgent_payoff";
  const anchorChapterOrder = resolveAnchorChapterOrder(signal, input);
  const requestedWindowSize = input.requestedWindowSize ?? resolveDefaultWindowSize(signal);
  const affectedChapterOrders = recommended
    ? buildWindowOrders(
      anchorChapterOrder,
      input.availableChapterOrders,
      requestedWindowSize,
      resolveWindowMode(signal),
    )
    : [];
  const triggerReason = buildTriggerReason(signal, input, blockingIssues, blockingLedgerKeys);
  const windowReason = buildWindowReason(
    signal,
    anchorChapterOrder,
    affectedChapterOrders,
    uniqueStrings(input.protectedSecrets ?? []),
  );
  return {
    recommended,
    reason: recommended ? triggerReason : "当前没有阻塞性状态信号，无需重规划后续章节。",
    blockingIssueIds,
    blockingLedgerKeys,
    affectedChapterOrders,
    anchorChapterOrder,
    triggerReason,
    windowReason,
    whyTheseChapters: buildWhyTheseChapters(signal, affectedChapterOrders, input.chapterStateGoal),
    signal,
    triggerType: input.triggerType?.trim() || "state_driven",
    sourceIssueIds: uniqueStrings(input.sourceIssueIds ?? []),
    windowSize: affectedChapterOrders.length,
  };
}
