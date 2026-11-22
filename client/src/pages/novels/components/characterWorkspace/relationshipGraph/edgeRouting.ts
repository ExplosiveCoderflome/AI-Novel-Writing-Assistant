import { Position, type XYPosition } from "@xyflow/react";
import { CARD_HEIGHT, CARD_WIDTH, COLUMN_STEP, ROW_STEP } from "./orderedLayout.ts";

export interface EdgeRoute {
  source: Position;
  target: Position;
  path: "curve" | "step" | "gutter";
}

// Node positions are card centres. Adjacent rows/columns share a clear corridor.
export function relationshipRoute(from: XYPosition, to: XYPosition, focusedTree: boolean): EdgeRoute {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = dx >= 0 ? Position.Right : Position.Left;
  const vertical = dy >= 0 ? Position.Top : Position.Bottom;
  const adjacentColumn = dx !== 0 && Math.abs(dx) <= COLUMN_STEP;
  const adjacentRow = dy !== 0 && Math.abs(dy) <= ROW_STEP;
  if (dx === 0 && dy === 0) return { source: Position.Right, target: Position.Top, path: "gutter" };
  const treeBranch = focusedTree && Math.abs(dx) >= CARD_WIDTH;
  if (treeBranch || (adjacentColumn && (!adjacentRow || Math.abs(dx) >= Math.abs(dy)))) {
    return { source: horizontal, target: dx >= 0 ? Position.Left : Position.Right, path: focusedTree || Math.abs(dy) <= ROW_STEP ? "curve" : "step" };
  }
  if (adjacentRow) {
    return { source: dy > 0 ? Position.Bottom : Position.Top, target: vertical, path: Math.abs(dx) <= COLUMN_STEP ? "curve" : "step" };
  }
  if (dy === 0) return { source: Position.Top, target: Position.Top, path: "step" };
  if (dx === 0) return { source: Position.Left, target: Position.Left, path: "step" };
  return { source: horizontal, target: vertical, path: "gutter" };
}

// For distant rows AND columns, turn in the gaps beside the two endpoint cards.
export function gutterPath(from: XYPosition, to: XYPosition, route: EdgeRoute): [string, number, number] {
  const x = from.x + (route.source === Position.Right ? 1 : -1) * (COLUMN_STEP - CARD_WIDTH) / 2;
  const y = to.y + (route.target === Position.Top ? -1 : 1) * (ROW_STEP - CARD_HEIGHT) / 2;
  return [`M ${from.x},${from.y} H ${x} V ${y} H ${to.x} V ${to.y}`, x, (from.y + y) / 2];
}
