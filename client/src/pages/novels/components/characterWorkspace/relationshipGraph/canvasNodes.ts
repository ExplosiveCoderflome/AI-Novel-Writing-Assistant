import type { Node, NodeChange, NodePositionChange, XYPosition } from "@xyflow/react";
import type { RelationshipGraphNode } from "../characterRelationshipGraphModel";

export type RelationshipFlowNode = Node<{ graphNode: RelationshipGraphNode }, "characterNode">;

// React Flow owns measurements and pointer movement. The book projection owns
// card content and the resting layout, which may refresh during a drag.
export function syncCanvasNodes(current: RelationshipFlowNode[], projected: RelationshipFlowNode[]) {
  const byId = new Map(current.map(node => [node.id, node]));
  const next = projected.map(node => {
    const live = byId.get(node.id);
    if (!live) return node;
    const position = live.dragging ? live.position : node.position;
    if (live.position.x === position.x && live.position.y === position.y &&
        live.data.graphNode === node.data.graphNode && live.selected === node.selected &&
        live.zIndex === node.zIndex) return live;
    return { ...live, data: node.data, selected: node.selected, zIndex: node.zIndex, position };
  });
  return next.length === current.length && next.every((node, index) => node === current[index]) ? current : next;
}

export function isSettledMove(change: NodeChange<RelationshipFlowNode>): change is NodePositionChange & { position: XYPosition } {
  return change.type === "position" && change.position !== undefined && change.dragging !== true;
}
