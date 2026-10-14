import type { ChapterWriteContext } from "@ai-novel/shared/types/chapterRuntime";
import { createContextBlock } from "../../../core/contextBudget";
import { buildLedgerItemLine, toListBlock } from "../chapterLayeredContextShared";

// Historical reference is a window, not a second copy of the current contract.
// Bound complete facts before rendering; never truncate a fact or mutate its source.
export function buildCompletedMilestonesBlock(facts: readonly string[]) {
  const lines: string[] = [];
  const seen = new Set<string>();
  let characters = 0;
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index].trim();
    if (!fact || seen.has(fact)) continue;
    seen.add(fact);
    if (characters + fact.length > 1600) continue;
    lines.push(fact);
    characters += fact.length;
    if (lines.length >= 24) break;
  }
  if (lines.length === 0) return null;
  return createContextBlock({
    id: "completed_milestones", group: "completed_milestones", priority: 85,
    required: false, allowSummary: false,
    content: toListBlock("近期已完成事项参考（不得重复追求；历史窗口不代表全部事实，本章硬约束以合同和当前状态为准）", lines.reverse()),
  });
}

/** Share only identical rendered facts; keep each bucket's membership and order. */
export function buildPayoffReminderText(write: ChapterWriteContext, mode: "full" | "review") {
  const groups = [
    { title: "Urgent payoffs", label: "urgent", items: write.ledgerUrgentItems },
    { title: "Overdue payoffs", label: "overdue", items: write.ledgerOverdueItems },
    { title: "Active pending payoffs", label: "pending", items: mode === "review" ? write.ledgerPendingItems : write.ledgerPendingItems.slice(0, 3) },
  ];
  const rows: string[] = [];
  const indexByBody = new Map<string, number>();
  const references = groups.map(group => ({
    ...group,
    refs: group.items.map(item => {
      const body = buildLedgerItemLine(item, "");
      let index = indexByBody.get(body);
      if (index === undefined) {
        index = rows.length;
        indexByBody.set(body, index);
        rows.push(buildLedgerItemLine(item, group.label));
      }
      return index;
    }),
  }));
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  // Preserve the familiar layout when there is nothing to share.
  if (rows.length === count) {
    return groups.map(group => toListBlock(group.title, group.items.map(item => buildLedgerItemLine(item, group.label)))).join("\n");
  }
  return [
    "相同提醒只列一次；各列表的 # 编号引用下面的完整提醒，并保留各自关注级别。",
    ...references.map(group => `${group.title}: ${group.refs.map(index => `#${index}`).join(", ") || "none"}`),
    ...rows.map((body, index) => `- #${index} ${body}`),
  ].join("\n");
}
