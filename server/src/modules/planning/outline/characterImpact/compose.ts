import type { OutlineEditOperation } from "../domain/outlineEditOperations";
import { assertValidOutlineEditOperations } from "../domain/outlineEditOperations";
import { AppError } from "../../../../middleware/errorHandler";
import { impactRoleLabels, impactRoles, type ImpactReview, type ImpactRole, type ImpactSnapshot, type ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";

const fields = {
  character: ["role", "goal", "motivation", "conflict", "secret", "arcDirection"],
  volume: ["summary", "promise", "pressure", "protagonistChange", "climax", "endingHook"],
  chapter: ["summary", "purpose", "conflict", "emotionalBeat", "endingHook"],
  payoff: ["setupDescription", "payoffDescription"],
};
type NodeType = keyof typeof fields;
type Change = OutlineEditOperation & {nodeType: NodeType; nodeId: string; fields: Record<string, string>; reason: string; risks: string[]; affectedNodeIds: string[]};
const invalid = (message: string) => new AppError(message, 400);

// A reviewer receives earlier validated edits as context. Keep their original
// attribution, and validate any new value, dependency or risk in the current role.
export function reviewHandoff(review: ImpactReview, prior: Partial<Record<ImpactRole, ImpactReview>>): ImpactReview {
  const earlier = Object.values(prior).flatMap(previous => previous.changes);
  const changes = review.changes.filter(item => !earlier.some(previous =>
    previous.nodeId === item.nodeId && previous.field === item.field && previous.value === item.value
    && item.dependsOnNodeIds.every(id => previous.dependsOnNodeIds.includes(id))
    && item.risks.every(risk => previous.risks.includes(risk))));
  return { changes, retained: review.retained };
}

export function composeImpact(snapshot: ImpactSnapshot, reviews: Partial<Record<ImpactRole, ImpactReview>>, origin: ImpactSummary["origin"]) {
  const doc = snapshot.document;
  const targets = new Map<string, {type: NodeType; values: Record<string, unknown>}>();
  const add = (type: NodeType, nodes: {nodeId: string}[]) => {
    for (const node of nodes) targets.set(node.nodeId, {type, values: {...node}});
  };
  add("character", doc.characters); add("volume", doc.volumes); add("chapter", doc.chapters); add("payoff", doc.payoffs);
  const known = new Set([doc.story.nodeId, ...targets.keys(), ...doc.facts.map(fact => fact.nodeId)]);
  const written = new Set(snapshot.writtenChapterIds);
  const operations = new Map<string, Change>();
  const retained: ImpactSummary["retained"] = [];
  for (const role of impactRoles) {
    const review = reviews[role];
    if (!review) continue;
    for (const item of review.retained) {
      if (!known.has(item.nodeId)) throw invalid("保留说明引用了大纲中不存在的内容。");
      retained.push({...item, role});
    }
    for (const item of review.changes) {
      const target = targets.get(item.nodeId);
      if (!target || !fields[target.type].includes(item.field)) throw invalid("建议修改了范围外的节点或字段。");
      const allowed = role === "character" ? item.nodeId === snapshot.characterId
        : role === "plot" ? target.type === "volume" || target.type === "chapter"
        : target.type === "payoff" || (target.type === "chapter" && item.field === "endingHook");
      if (!allowed) throw invalid(`${impactRoleLabels[role]}审阅提出了职责范围以外的修改。`);
      if (written.has(item.nodeId)) throw invalid("这项建议涉及已有正文的章节，只能作为保留说明。");
      if (item.value === (target.values[item.field] ?? "")) continue;
      let op = operations.get(item.nodeId);
      if (!op) {
        op = {operationId: item.nodeId, nodeId: item.nodeId, nodeType: target.type, kind: "update_fields", fields: {}, reason: "", dependsOn: [], risks: [], affectedNodeIds: [item.nodeId]};
        operations.set(item.nodeId, op);
      }
      if (op.fields[item.field] !== undefined && op.fields[item.field] !== item.value) throw invalid("两份建议对同一字段给出了不同改法，请统一后再提交。");
      op.fields[item.field] = item.value;
      const reason = `${impactRoleLabels[role]} · ${item.reason}`;
      if (!op.reason.split("\n").includes(reason)) op.reason = [op.reason, reason].filter(Boolean).join("\n");
      op.dependsOn = [...new Set([...op.dependsOn, ...item.dependsOnNodeIds])];
      op.risks = [...new Set([...op.risks, ...item.risks])];
    }
  }
  const edits = [...operations.values()];
  if (edits.length && impactRoles.every(role => reviews[role])) assertValidOutlineEditOperations(edits, {document: doc});
  return {operations: edits, impact: {origin, characterId: snapshot.characterId, writtenChapterIds: snapshot.writtenChapterIds, retained} satisfies ImpactSummary};
}
