import { currentOutlinePlanning } from "./OutlinePlanningContext";
/** Execution detail is a supplement, not a proposal to replace adopted planning fields. */
export function retainedOutlineChapterFields(chapterId: string): {purpose?: string; payoffRefs: string[]} | undefined {
  const state = currentOutlinePlanning();
  if (!state) return;
  const mapped = state.mapping.chapters.find(c => c.planId === chapterId || c.chapterId === chapterId);
  if (!mapped) return;
  const rule = state.policy.rules.find(r => r.nodeId === mapped.nodeId && r.field === "purpose" && r.mode !== "fill_missing");
  const source = state.document.chapters.find(c => c.nodeId === mapped.nodeId)!;
  return {purpose: typeof rule?.value === "string" ? rule.value : undefined,
    payoffRefs: source.payoffNodeIds.map(id => `计划：${state.document.payoffs.find(p => p.nodeId === id)!.title} [${state.mapping.payoffs.find(p => p.nodeId === id)!.ledgerKey}]`)};
}
