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

export type ImpactSkipReason = "out_of_scope" | "written_chapter" | "conflicting_change" | "unknown_node";
export interface ImpactSkippedChange {
  role: ImpactRole;
  nodeId: string;
  field?: string;
  reason: ImpactSkipReason;
}
export interface ImpactComposeResult {
  operations: Change[];
  impact: ImpactSummary;
  skipped: ImpactSkippedChange[];
}
const invalid = (message: string) => new AppError(message, 400);

// Two policies for the same scope rules. Model output on the workbench is
// noisy: one reviewer overreaching must not void the other reviewers' usable
// changes, so out-of-scope items are skipped and recorded instead of failing
// the whole proposal. External submissions are explicit tool input, so the
// same violations are still rejected outright.
export function composeImpact(snapshot: ImpactSnapshot, reviews: Partial<Record<ImpactRole, ImpactReview>>, origin: ImpactSummary["origin"]): ImpactComposeResult {
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
  const skipped: ImpactSkippedChange[] = [];
  const lenient = origin === "workbench";
  // Records the item and skips it on the workbench; rejects it outright for
  // external submissions. Always exits the current item either way.
  const skip = (item: ImpactSkippedChange, message: string): true => {
    if (lenient) { skipped.push(item); return true; }
    throw invalid(message);
  };
  for (const role of impactRoles) {
    const review = reviews[role];
    if (!review) continue;
    for (const item of review.retained) {
      if (!known.has(item.nodeId)) {
        skip({role, nodeId: item.nodeId, reason: "unknown_node"}, "保留说明引用了大纲中不存在的内容。");
        continue;
      }
      retained.push({...item, role});
    }
    for (const item of review.changes) {
      const target = targets.get(item.nodeId);
      if (!target || !fields[target.type].includes(item.field)) {
        skip({role, nodeId: item.nodeId, field: item.field, reason: "out_of_scope"}, "建议修改了范围外的节点或字段。");
        continue;
      }
      const allowed = role === "character" ? item.nodeId === snapshot.characterId
        : role === "plot" ? target.type === "volume" || target.type === "chapter"
        : target.type === "payoff" || (target.type === "chapter" && item.field === "endingHook");
      if (!allowed) {
        skip({role, nodeId: item.nodeId, field: item.field, reason: "out_of_scope"}, "这项建议超出了本次人物联动可改的范围。");
        continue;
      }
      if (written.has(item.nodeId)) {
        skip({role, nodeId: item.nodeId, field: item.field, reason: "written_chapter"}, "这项建议涉及已有正文的章节，无法修改。");
        continue;
      }
      if (item.value === (target.values[item.field] ?? "")) continue;
      let op = operations.get(item.nodeId);
      if (!op) {
        op = {operationId: item.nodeId, nodeId: item.nodeId, nodeType: target.type, kind: "update_fields", fields: {}, reason: "", dependsOn: [], risks: [], affectedNodeIds: [item.nodeId]};
        operations.set(item.nodeId, op);
      }
      if (op.fields[item.field] !== undefined && op.fields[item.field] !== item.value) {
        skip({role, nodeId: item.nodeId, field: item.field, reason: "conflicting_change"}, "两份建议对同一字段给出了不同改法，请统一后再提交。");
        continue;
      }
      op.fields[item.field] = item.value;
      const reason = `${impactRoleLabels[role]} · ${item.reason}`;
      if (!op.reason.split("\n").includes(reason)) op.reason = [op.reason, reason].filter(Boolean).join("\n");
      op.dependsOn = [...new Set([...op.dependsOn, ...item.dependsOnNodeIds])];
      op.risks = [...new Set([...op.risks, ...item.risks])];
    }
  }
  const edits = [...operations.values()];
  if (lenient) {
    // A skipped change can leave a dangling dependency behind: another kept
    // change may depend on a node that no longer has an operation in this
    // proposal. Drop those references (and self-references) so the proposal
    // stays structurally valid instead of failing on a prerequisite that
    // was filtered out. External submissions keep the strict failure.
    const operationIds = new Set(operations.keys());
    for (const op of operations.values()) {
      op.dependsOn = op.dependsOn.filter(id => id !== op.operationId && operationIds.has(id));
    }
  }
  if (edits.length && impactRoles.every(role => reviews[role])) assertValidOutlineEditOperations(edits, {document: doc});
  return {operations: edits, impact: {origin, characterId: snapshot.characterId, writtenChapterIds: snapshot.writtenChapterIds, retained} satisfies ImpactSummary, skipped};
}

// Raised when every proposed change was skipped, so there is nothing to
// adopt. The message names the real cause: the written-chapter half is only
// mentioned when a written chapter was actually involved.
export function buildNoUsableImpactError(skipped: ImpactSkippedChange[]): AppError {
  const written = skipped.some(item => item.reason === "written_chapter");
  const scope = skipped.some(item => item.reason !== "written_chapter");
  if (written && scope) return invalid("这次提的修改里，有的碰到了已经写过正文的章节、有的不在人物联动可改的范围内，没有一条能用。请换个说法再试一次。");
  if (written) return invalid("这次提的修改都碰到了已经写过正文的章节，改不了。请换个还没写正文的部分再试一次。");
  return invalid("这次提的修改都不在人物联动可改的范围内，请换个说法再试一次。");
}
