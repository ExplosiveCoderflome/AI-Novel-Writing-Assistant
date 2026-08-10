import type { WorldGeographyDirection } from "@ai-novel/shared/types/world";

export type GraphNode = {
  id: string;
  label: string;
  type?: string;
  x?: number;
  y?: number;
  directionHint?: WorldGeographyDirection;
  regionType?: string;
  terrain?: string;
  summary?: string;
  controllingForceIds?: string[];
  risk?: string;
  storyRelevance?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: string;
  routeType?: string;
  distanceHint?: string;
  direction?: WorldGeographyDirection;
  risk?: string;
};

export type Point = { x: number; y: number };

export type LabelPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EdgeLabelPlacement = LabelPlacement & {
  label: string;
};

type Obstacle = LabelPlacement & { id?: string };
type Anchor = "top" | "bottom" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export type GraphLayout = "force" | "geography";

export const ROUTE_STYLES: Record<string, { stroke: string; dash?: string }> = {
  road: { stroke: "#64748b" },
  river: { stroke: "#0284c7", dash: "6 5" },
  sea: { stroke: "#2563eb", dash: "10 6" },
  portal: { stroke: "#7c3aed", dash: "3 5" },
  trade: { stroke: "#16a34a", dash: "8 5" },
  military: { stroke: "#dc2626", dash: "5 4" },
  border: { stroke: "#f59e0b", dash: "4 4" },
  other: { stroke: "#64748b" },
};

export function getRouteStyle(routeType?: string) {
  if (!routeType) return ROUTE_STYLES.road;
  return ROUTE_STYLES[routeType] || ROUTE_STYLES.road;
}

const DIRECTION_LABELS: Record<WorldGeographyDirection, string> = {
  north: "北",
  south: "南",
  east: "东",
  west: "西",
  center: "中",
  northeast: "东北",
  northwest: "西北",
  southeast: "东南",
  southwest: "西南",
};

export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function getNodeBadgeText(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

function wrapLabel(label: string, lineSize = 6, maxLines = 3): string[] {
  const normalized = label.trim();
  if (!normalized) {
    return [];
  }
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += lineSize) {
    chunks.push(normalized.slice(index, index + lineSize));
    if (chunks.length >= maxLines) {
      break;
    }
  }
  if (normalized.length > lineSize * maxLines && chunks.length > 0) {
    const lastIndex = chunks.length - 1;
    chunks[lastIndex] = `${chunks[lastIndex].slice(0, Math.max(1, lineSize - 1))}…`;
  }
  return chunks;
}

function getMapLabelMeta(node: GraphNode): string {
  return [
    node.directionHint ? DIRECTION_LABELS[node.directionHint] : "",
    node.terrain ? truncateText(node.terrain, 8) : "",
    node.risk ? "风险" : "",
  ].filter(Boolean).join(" / ");
}

export function getLabelSize(node: GraphNode, layout: "graph" | "map") {
  const labelLines = wrapLabel(node.label, layout === "map" ? 6 : 7, layout === "map" ? 2 : 2);
  const metaText = layout === "map" ? getMapLabelMeta(node) : "";
  const longestLine = Math.max(...labelLines.map((line) => line.length), metaText.length, 0);
  return {
    labelLines,
    metaText,
    width: Math.max(layout === "map" ? 94 : 86, Math.min(layout === "map" ? 146 : 158, longestLine * 12 + 24)),
    height: Math.max(30, labelLines.length * 15 + 12 + (metaText ? 14 : 0)),
  };
}

export function buildFactionLayout(nodes: GraphNode[], width: number, height: number): Map<string, Point> {
  const result = new Map<string, Point>();
  if (nodes.length === 0) {
    return result;
  }
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width * 0.39, Math.max(210, nodes.length * 29));
  const radiusY = Math.min(height * 0.34, Math.max(128, nodes.length * 14));
  const grouped = new Map<string, GraphNode[]>();
  nodes.forEach((node) => {
    const key = node.type?.trim() || "other";
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  });
  const ordered = Array.from(grouped.values()).flatMap((group, groupIndex) => (
    groupIndex % 2 === 0 ? group : [...group].reverse()
  ));
  const angleOffset = -Math.PI / 2;
  ordered.forEach((node, index) => {
    const angle = angleOffset + (Math.PI * 2 * index) / Math.max(ordered.length, 1);
    const ringOffset = nodes.length > 10 && index % 2 === 1 ? 0.78 : 1;
    result.set(node.id, {
      x: centerX + radiusX * ringOffset * Math.cos(angle),
      y: centerY + radiusY * ringOffset * Math.sin(angle),
    });
  });
  return result;
}

function spreadAxis(values: Array<number | undefined>, padding: number): Array<number | undefined> {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length < 2) {
    return values;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  if (range >= 36) {
    return values.map((value) => value == null ? undefined : Math.max(4, Math.min(96, value)));
  }
  if (range < 0.5) {
    return values;
  }
  return values.map((value) => value == null
    ? undefined
    : padding + ((value - min) / range) * (100 - padding * 2));
}

export function buildMapLayout(nodes: GraphNode[], width: number, height: number): Map<string, Point> {
  const result = new Map<string, Point>();
  const fallback = buildFactionLayout(nodes, width, height);
  const paddingX = 88;
  const paddingY = 68;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const spreadX = spreadAxis(nodes.map((node) => node.x), 18);
  const spreadY = spreadAxis(nodes.map((node) => node.y), 18);
  const duplicateCounts = new Map<string, number>();

  nodes.forEach((node, index) => {
    const rawX = spreadX[index];
    const rawY = spreadY[index];
    const fallbackPoint = fallback.get(node.id) ?? { x: width / 2, y: height / 2 };
    let x = rawX == null ? fallbackPoint.x : paddingX + (Math.max(4, Math.min(96, rawX)) / 100) * innerWidth;
    let y = rawY == null ? fallbackPoint.y : paddingY + (Math.max(4, Math.min(96, rawY)) / 100) * innerHeight;
    const key = `${Math.round(x / 18)}:${Math.round(y / 18)}`;
    const duplicateIndex = duplicateCounts.get(key) ?? 0;
    duplicateCounts.set(key, duplicateIndex + 1);
    if (duplicateIndex > 0) {
      const angle = duplicateIndex * 2.4;
      const distance = 30 + Math.floor(duplicateIndex / 3) * 12;
      x += Math.cos(angle) * distance;
      y += Math.sin(angle) * distance;
    }
    result.set(node.id, {
      x: Math.max(54, Math.min(width - 54, x)),
      y: Math.max(48, Math.min(height - 48, y)),
    });
  });
  return result;
}

function overlaps(a: LabelPlacement, b: LabelPlacement, gap = 8): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function overlapArea(a: LabelPlacement, b: LabelPlacement): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function clampPlacement(candidate: LabelPlacement, width: number, height: number): LabelPlacement {
  return {
    ...candidate,
    x: Math.max(12, Math.min(width - candidate.width - 12, candidate.x)),
    y: Math.max(12, Math.min(height - candidate.height - 12, candidate.y)),
  };
}

function getNodeObstacle(id: string, point: Point, layout: "graph" | "map"): Obstacle {
  const size = layout === "map" ? 62 : 68;
  return { id, x: point.x - size / 2, y: point.y - size / 2, width: size, height: size };
}

function getCrowdingScore(node: GraphNode, positions: Map<string, Point>): number {
  const point = positions.get(node.id);
  if (!point) {
    return 0;
  }
  let score = 0;
  positions.forEach((other, otherId) => {
    if (otherId !== node.id) {
      score += 1 / Math.max(24, Math.hypot(point.x - other.x, point.y - other.y));
    }
  });
  return score;
}

function pushAnchorCandidate(
  candidates: Array<{ x: number; y: number }>,
  point: Point,
  width: number,
  height: number,
  anchor: Anchor,
  distance: number,
) {
  const verticalGap = 32 + (distance - 1) * 32;
  const horizontalGap = 34 + (distance - 1) * 38;
  const diagonalGap = 22 + (distance - 1) * 34;
  const placements: Record<Anchor, Point> = {
    top: { x: point.x - width / 2, y: point.y - height - verticalGap },
    bottom: { x: point.x - width / 2, y: point.y + verticalGap },
    left: { x: point.x - width - horizontalGap, y: point.y - height / 2 },
    right: { x: point.x + horizontalGap, y: point.y - height / 2 },
    topLeft: { x: point.x - width - diagonalGap, y: point.y - height - diagonalGap },
    topRight: { x: point.x + diagonalGap, y: point.y - height - diagonalGap },
    bottomLeft: { x: point.x - width - diagonalGap, y: point.y + diagonalGap },
    bottomRight: { x: point.x + diagonalGap, y: point.y + diagonalGap },
  };
  candidates.push(placements[anchor]);
}

function getLabelCandidates(
  point: Point,
  width: number,
  height: number,
  layout: "graph" | "map",
  direction: WorldGeographyDirection | undefined,
  index: number,
) {
  const candidates: Array<{ x: number; y: number }> = [];
  const directionAnchors: Partial<Record<WorldGeographyDirection, Anchor[]>> = {
    north: ["bottom", "bottomRight", "bottomLeft"],
    south: ["top", "topRight", "topLeft"],
    east: ["left", "bottomLeft", "topLeft"],
    west: ["right", "bottomRight", "topRight"],
    northeast: ["bottomLeft", "left", "bottom"],
    northwest: ["bottomRight", "right", "bottom"],
    southeast: ["topLeft", "left", "top"],
    southwest: ["topRight", "right", "top"],
  };
  const anchors: Anchor[] = ["bottom", "top", "right", "left", "bottomRight", "bottomLeft", "topRight", "topLeft"];
  const preferred = layout === "map" && direction ? directionAnchors[direction] ?? [] : [];
  const rotated = anchors.map((_, offset) => anchors[(offset + index) % anchors.length]);
  const ordered = [...preferred, ...rotated.filter((anchor) => !preferred.includes(anchor))];
  for (const distance of [1, 2, 3]) {
    ordered.forEach((anchor) => pushAnchorCandidate(candidates, point, width, height, anchor, distance));
  }
  return candidates;
}

export function buildLabelPlacements(
  nodes: GraphNode[],
  positions: Map<string, Point>,
  width: number,
  height: number,
  layout: "graph" | "map",
): Map<string, LabelPlacement> {
  const result = new Map<string, LabelPlacement>();
  const nodeObstacles = nodes
    .map((node) => {
      const point = positions.get(node.id);
      return point ? getNodeObstacle(node.id, point, layout) : null;
    })
    .filter((item): item is Obstacle => Boolean(item));
  const placed: LabelPlacement[] = [];
  const sortedNodes = [...nodes].sort((a, b) => getCrowdingScore(b, positions) - getCrowdingScore(a, positions));

  sortedNodes.forEach((node, index) => {
    const point = positions.get(node.id);
    if (!point) {
      return;
    }
    const size = getLabelSize(node, layout);
    const candidates = getLabelCandidates(point, size.width, size.height, layout, node.directionHint, index)
      .map((candidate) => clampPlacement({ ...candidate, width: size.width, height: size.height }, width, height));
    const scoreCandidate = (candidate: LabelPlacement) => {
      const labelPenalty = placed.reduce((sum, item) => sum + overlapArea(candidate, item) * 20, 0);
      const nodePenalty = nodeObstacles
        .filter((item) => item.id !== node.id)
        .reduce((sum, item) => sum + overlapArea(candidate, item) * 35, 0);
      return labelPenalty + nodePenalty;
    };
    const selected = candidates.find((candidate) => (
      !placed.some((item) => overlaps(candidate, item))
      && !nodeObstacles.some((item) => item.id !== node.id && overlaps(candidate, item))
    )) ?? [...candidates].sort((a, b) => scoreCandidate(a) - scoreCandidate(b))[0];
    if (selected) {
      placed.push(selected);
      result.set(node.id, selected);
    }
  });
  return result;
}

export function buildEdgeLabelPlacements(
  edges: GraphEdge[],
  positions: Map<string, Point>,
  nodeLabels: Map<string, LabelPlacement>,
  width: number,
  height: number,
  layout: "graph" | "map",
): EdgeLabelPlacement[] {
  const occupied = [...nodeLabels.values()];
  const result: EdgeLabelPlacement[] = [];
  edges.forEach((edge, edgeIndex) => {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) {
      result.push({ x: 0, y: 0, width: 0, height: 0, label: "" });
      return;
    }
    const label = truncateText(edge.relation, layout === "map" ? 7 : 9);
    const labelWidth = Math.max(50, Math.min(126, label.length * 11 + 20));
    const labelHeight = 22;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const offsetSign = edgeIndex % 2 === 0 ? 1 : -1;
    const offsets = [20 * offsetSign, -20 * offsetSign, 36 * offsetSign, -36 * offsetSign, 0];
    const candidates = offsets.map((offset) => clampPlacement({
      x: midpoint.x + normal.x * offset - labelWidth / 2,
      y: midpoint.y + normal.y * offset - labelHeight / 2,
      width: labelWidth,
      height: labelHeight,
    }, width, height));
    const score = (candidate: LabelPlacement) => occupied.reduce((sum, item) => sum + overlapArea(candidate, item), 0);
    const selected = candidates.find((candidate) => !occupied.some((item) => overlaps(candidate, item, 5)))
      ?? [...candidates].sort((a, b) => score(a) - score(b))[0];
    const placement = { ...(selected ?? candidates[0]), label };
    occupied.push(placement);
    result.push(placement);
  });
  return result;
}

export function getRiskTone(risk?: string): string {
  if (!risk) {
    return "#0ea5e9";
  }
  if (/高|危险|封锁|暗杀|战争|失控|禁区|崩溃/.test(risk)) {
    return "#dc2626";
  }
  if (/中|紧张|巡防|冲突|代价|压力/.test(risk)) {
    return "#f59e0b";
  }
  return "#0ea5e9";
}
