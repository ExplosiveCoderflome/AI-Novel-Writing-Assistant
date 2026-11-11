import type { OutlineDocument } from "./outlineDocument";

export interface OutlineChange { nodeId: string; kind: "added" | "removed" | "updated" | "moved"; before?: unknown; after?: unknown; }
export function diffOutlineDocuments(before: OutlineDocument, after: OutlineDocument): OutlineChange[] {
  const flatten = (doc: OutlineDocument) => new Map<string, { node: unknown; parent: string | null; order: number }>([
    [doc.story.nodeId, { node: doc.story, parent: null, order: -1 }],
    ...doc.volumes.map(x => [x.nodeId, { node: x, parent: "story", order: x.order }] as const),
    ...doc.chapters.map(x => [x.nodeId, { node: x, parent: x.volumeNodeId, order: x.order }] as const),
    ...doc.characters.map(x => [x.nodeId, { node: x, parent: null, order: 0 }] as const),
    ...doc.payoffs.map(x => [x.nodeId, { node: x, parent: null, order: 0 }] as const),
    ...doc.facts.map(x => [x.nodeId, { node: x, parent: null, order: 0 }] as const),
  ]);
  const left = flatten(before), right = flatten(after);
  const changes: OutlineChange[] = [];
  for (const [id, value] of left) {
    const next = right.get(id);
    if (!next) changes.push({ nodeId: id, kind: "removed", before: value.node });
    else if (value.parent !== next.parent || value.order !== next.order) changes.push({ nodeId: id, kind: "moved", before: value, after: next });
    else if (JSON.stringify(value.node) !== JSON.stringify(next.node)) changes.push({ nodeId: id, kind: "updated", before: value.node, after: next.node });
  }
  for (const [id, value] of right) if (!left.has(id)) changes.push({ nodeId: id, kind: "added", after: value.node });
  return changes;
}
