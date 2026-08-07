import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
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
export type GraphLayout = "graph" | "map";

export const GRAPH_NODE_SIZE = {
  graph: { width: 204, height: 82 },
  map: { width: 148, height: 72 },
} as const;

export const ROUTE_STYLES: Record<string, { stroke: string; dash?: string; label: string }> = {
  road: { stroke: "#64748b", label: "道路" },
  river: { stroke: "#0284c7", dash: "6 5", label: "河流" },
  sea: { stroke: "#2563eb", dash: "10 6", label: "海路" },
  portal: { stroke: "#7c3aed", dash: "3 5", label: "传送" },
  trade: { stroke: "#16a34a", dash: "8 5", label: "商道" },
  military: { stroke: "#dc2626", dash: "5 4", label: "军道" },
  border: { stroke: "#f59e0b", dash: "4 4", label: "边界" },
  other: { stroke: "#64748b", label: "其他" },
};

const DIRECTION_COORDINATES: Record<WorldGeographyDirection, Point> = {
  north: { x: 50, y: 14 },
  south: { x: 50, y: 86 },
  east: { x: 86, y: 50 },
  west: { x: 14, y: 50 },
  center: { x: 50, y: 50 },
  northeast: { x: 78, y: 22 },
  northwest: { x: 22, y: 22 },
  southeast: { x: 78, y: 78 },
  southwest: { x: 22, y: 78 },
};

interface ForceNode extends SimulationNodeDatum {
  id: string;
  anchorX: number;
  anchorY: number;
}

interface ForceEdge extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
}

type Rect = { x: number; y: number; width: number; height: number };

function hashGraph(nodes: GraphNode[], edges: GraphEdge[], layout: GraphLayout): number {
  const input = `${layout}|${nodes.map((node) => node.id).sort().join("|")}|${edges
    .map((edge) => `${edge.source}>${edge.target}:${edge.relation}`)
    .sort()
    .join("|")}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function spreadAxis(values: Array<number | undefined>, padding: number): Array<number | undefined> {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length < 2) return values;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  if (range < 0.5) return values;
  if (range >= 36) {
    return values.map((value) => value == null ? undefined : Math.max(4, Math.min(96, value)));
  }
  return values.map((value) => value == null ? undefined : padding + ((value - min) / range) * (100 - padding * 2));
}

function clampPosition(point: Point, width: number, height: number, layout: GraphLayout): Point {
  const size = GRAPH_NODE_SIZE[layout];
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  return {
    x: Math.max(halfWidth + 28, Math.min(width - halfWidth - 28, point.x)),
    y: Math.max(halfHeight + 24, Math.min(height - halfHeight - 24, point.y)),
  };
}

function createFactionForceNodes(nodes: GraphNode[], width: number, height: number): ForceNode[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width * 0.36, Math.max(220, nodes.length * 28));
  const radiusY = Math.min(height * 0.34, Math.max(140, nodes.length * 15));
  return nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    const ring = nodes.length > 10 && index % 2 === 1 ? 0.72 : 1;
    const x = centerX + radiusX * ring * Math.cos(angle);
    const y = centerY + radiusY * ring * Math.sin(angle);
    return { id: node.id, x, y, anchorX: x, anchorY: y };
  });
}

function createMapForceNodes(nodes: GraphNode[], width: number, height: number): ForceNode[] {
  const spreadX = spreadAxis(nodes.map((node) => node.x), 14);
  const spreadY = spreadAxis(nodes.map((node) => node.y), 14);
  const innerWidth = width - 196;
  const innerHeight = height - 144;
  return nodes.map((node, index) => {
    const fallback = node.directionHint ? DIRECTION_COORDINATES[node.directionHint] : {
      x: 18 + ((index * 31) % 64),
      y: 18 + ((index * 47) % 64),
    };
    const normalizedX = spreadX[index] ?? fallback.x;
    const normalizedY = spreadY[index] ?? fallback.y;
    const anchorX = 98 + (Math.max(4, Math.min(96, normalizedX)) / 100) * innerWidth;
    const anchorY = 72 + (Math.max(4, Math.min(96, normalizedY)) / 100) * innerHeight;
    return { id: node.id, x: anchorX, y: anchorY, anchorX, anchorY };
  });
}

export function buildGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  layout: GraphLayout,
): Map<string, Point> {
  if (nodes.length === 0) return new Map();
  const forceNodes = layout === "map"
    ? createMapForceNodes(nodes, width, height)
    : createFactionForceNodes(nodes, width, height);
  const nodeIds = new Set(forceNodes.map((node) => node.id));
  const forceEdges: ForceEdge[] = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }));
  const simulation = forceSimulation<ForceNode>(forceNodes)
    .randomSource(seededRandom(hashGraph(nodes, edges, layout)))
    .force("collide", forceCollide<ForceNode>(layout === "map" ? 82 : 122).strength(0.96).iterations(3))
    .stop();

  if (layout === "map") {
    simulation
      .force("anchor-x", forceX<ForceNode>((node) => node.anchorX).strength(0.24))
      .force("anchor-y", forceY<ForceNode>((node) => node.anchorY).strength(0.24))
      .force("charge", forceManyBody<ForceNode>().strength(-70));
  } else {
    simulation
      .force("links", forceLink<ForceNode, ForceEdge>(forceEdges).id((node) => node.id).distance(210).strength(0.24))
      .force("charge", forceManyBody<ForceNode>().strength(-690))
      .force("center", forceCenter(width / 2, height / 2).strength(0.08))
      .force("canvas-x", forceX<ForceNode>(width / 2).strength(0.065))
      .force("canvas-y", forceY<ForceNode>(height / 2).strength(0.065));
  }
  simulation.tick(layout === "map" ? 180 : 220);

  return new Map(forceNodes.map((node) => [
    node.id,
    clampPosition({ x: node.x ?? node.anchorX, y: node.y ?? node.anchorY }, width, height, layout),
  ]));
}

export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function getShortRelation(edge: GraphEdge): string {
  return truncateText(edge.relation || "关系", 5);
}

export function getNodeBadgeText(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

export function getRouteStyle(routeType?: string) {
  return ROUTE_STYLES[routeType ?? "other"] ?? ROUTE_STYLES.other;
}

function overlaps(first: Rect, second: Rect, gap = 8): boolean {
  return first.x < second.x + second.width + gap
    && first.x + first.width + gap > second.x
    && first.y < second.y + second.height + gap
    && first.y + first.height + gap > second.y;
}

export function getVisibleEdgeLabelIds(
  edges: Array<GraphEdge & { id: string }>,
  positions: Map<string, Point>,
  layout: GraphLayout,
): Set<string> {
  const size = GRAPH_NODE_SIZE[layout];
  const obstacles: Rect[] = [...positions.values()].map((point) => ({
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  }));
  const visible = new Set<string>();
  edges.forEach((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return;
    const label = getShortRelation(edge);
    const width = Math.max(44, Math.min(92, label.length * 12 + 20));
    const rect: Rect = {
      x: (source.x + target.x) / 2 - width / 2,
      y: (source.y + target.y) / 2 - 12,
      width,
      height: 24,
    };
    if (obstacles.some((obstacle) => overlaps(rect, obstacle, 10))) return;
    visible.add(edge.id);
    obstacles.push(rect);
  });
  return visible;
}

export function getRiskTone(risk?: string): string {
  if (!risk) return "#0ea5e9";
  if (/高|危险|封锁|暗杀|战争|失控|禁区|崩溃/.test(risk)) return "#dc2626";
  if (/中|紧张|巡防|冲突|代价|压力/.test(risk)) return "#f59e0b";
  return "#0ea5e9";
}
