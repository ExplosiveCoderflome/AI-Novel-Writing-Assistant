import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookPolicy, OutlinePolicyPatch } from "@ai-novel/shared/types/outlineOpenBook";
import { validateOpenBookDocument, canonicalJson } from "./mapping";
import { OutlineOpenBookError } from "./errors";
export function applyOutlinePolicy(document: OutlineDocument, policy: OutlineBookPolicy): OutlineDocument {
  const effective = structuredClone(document);
  const nodes = [effective.story, ...effective.volumes, ...effective.chapters, ...effective.characters, ...effective.payoffs, ...effective.facts];
  for (const rule of policy.rules) {
    const node = nodes.find(n => n.nodeId === rule.nodeId);
    if (node && rule.value !== undefined) (node as unknown as Record<string, unknown>)[rule.field] = rule.value;
  }
  return validateOpenBookDocument(effective);
}
export function patchOutlinePolicy(current: OutlineBookPolicy, patch: OutlinePolicyPatch) {
  const next = structuredClone(current);
  const seen = new Set<string>();
  for (const change of patch.changes) {
    const key = `${change.nodeId}.${change.field}`;
    if (seen.has(key)) throw new OutlineOpenBookError("OUTLINE_POLICY_INVALID", "同一字段不能重复修改。", 422);
    seen.add(key);
    const rule = next.rules.find(r => r.nodeId === change.nodeId && r.field === change.field);
    if (!rule) throw new OutlineOpenBookError("OUTLINE_POLICY_INVALID", "身份、章序和来源不能通过保留设置修改。", 422);
    if (rule.mode === "hard_constraint" && (change.mode && change.mode !== "hard_constraint" || "value" in change && canonicalJson(change.value) !== canonicalJson(rule.value)) && !patch.confirmHardConstraintChange)
      throw new OutlineOpenBookError("OUTLINE_HARD_CONSTRAINT_CONFIRM_REQUIRED", "修改固定设定需要单独明确确认。", 422);
    if (change.mode) rule.mode = change.mode;
    if ("value" in change) rule.value = change.value;
  }
  return next;
}
