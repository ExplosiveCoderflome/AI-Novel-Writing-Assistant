import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookMapping, OutlineBookPolicy } from "@ai-novel/shared/types/outlineOpenBook";
import type { OutlineFeedbackSettings } from "@ai-novel/shared/types/outlineFeedback";
import type { OutlineFeedbackPromptInput } from "../../../../../prompting/prompts/outline/feedback.prompts";

export function feedbackDue(settings: OutlineFeedbackSettings, order: number, mapping: OutlineBookMapping) {
  return settings.mode === "chapter" || settings.mode === "every_n" && order % settings.everyN === 0
    || settings.mode === "volume" && [...mapping.volumes, ...(mapping.runtimeVolumes ?? [])].some(v => v.to === order);
}
export function feedbackNodes(document: OutlineDocument, mapping: OutlineBookMapping, policy: OutlineBookPolicy, order: number): OutlineFeedbackPromptInput["nodes"] {
  const current = mapping.chapters.find(c => c.chapterOrder === order);
  const future = mapping.chapters.filter(c => c.chapterOrder > order).sort((a,b) => a.chapterOrder-b.chapterOrder).slice(0, 8);
  const chapters = document.chapters.filter(c => c.nodeId === current?.nodeId || future.some(m => m.nodeId === c.nodeId));
  const characterIds = new Set(chapters.flatMap(c => c.characterNodeIds));
  const payoffIds = new Set(chapters.flatMap(c => c.payoffNodeIds));
  const nodes = [
    ...document.chapters.filter(c => future.some(m => m.nodeId === c.nodeId)).map(c => ({type: "chapter", node: c, allowed: ["summary", "purpose", "conflict", "emotionalBeat", "endingHook"]})),
    ...document.characters.filter(c => characterIds.has(c.nodeId) || c.appearanceNodeIds.some(id => chapters.some(x => x.nodeId === id))).slice(0, 8).map(c => ({type: "character", node: c, allowed: ["arcDirection", "goal", "motivation", "conflict"]})),
    ...document.payoffs.filter(p => payoffIds.has(p.nodeId) || [...p.setupChapterNodeIds, ...p.payoffChapterNodeIds].some(id => chapters.some(c => c.nodeId === id))).slice(0, 8).map(p => ({type: "payoff", node: p, allowed: ["setupDescription", "payoffDescription"]})),
  ];
  const candidates = nodes.map(({type, node, allowed}) => ({type, nodeId: node.nodeId, fields: Object.fromEntries(allowed.filter(field => {
    const rule = policy.rules.find(r => r.nodeId === node.nodeId && r.field === field);
    return rule && ["propose_change", "fill_missing"].includes(rule.mode);
  }).map(field => [field, String((node as unknown as Record<string, unknown>)[field] ?? "").slice(0, 800)]))})).filter(n => Object.keys(n.fields).length > 0);
  let size = 0;
  return candidates.filter(node => { const length = JSON.stringify(node).length; if (size+length > 12000) return false; size += length; return true; });
}
