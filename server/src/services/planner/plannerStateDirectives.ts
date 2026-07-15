export function compactPlannerText(value: string | null | undefined, fallback = ""): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

export function takeUniquePlannerItems(
  items: Array<string | null | undefined>,
  limit = items.length,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = compactPlannerText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function buildPlannerStateDrivenDirective(input: {
  nextAction: string;
  pendingReviewProposalCount: number;
  openAuditIssueCount: number;
}): string {
  return [
    `recommended_next_action=${input.nextAction}`,
    `pending_state_review=${input.pendingReviewProposalCount}`,
    `open_audit_issues=${input.openAuditIssueCount}`,
  ].join("\n");
}

export function buildPlannerStateGoalText(input: {
  summary: string | null;
  targetConflicts: string[];
  targetRelationships: string[];
  targetPayoffs: string[];
  protectedSecrets: string[];
  recentTimeline: string[];
}): string {
  return [
    `章节状态目标：${compactPlannerText(input.summary, "无")}`,
    `应推进冲突：${takeUniquePlannerItems(input.targetConflicts, 4).join("；") || "无"}`,
    `应推进关系：${takeUniquePlannerItems(input.targetRelationships, 4).join("；") || "无"}`,
    `应触碰 payoff：${takeUniquePlannerItems(input.targetPayoffs, 4).join("；") || "无"}`,
    `禁止提前泄露：${takeUniquePlannerItems(input.protectedSecrets, 4).join("；") || "无"}`,
    `最近关键事件：${takeUniquePlannerItems(input.recentTimeline, 3).join("；") || "无"}`,
  ].join("\n");
}
