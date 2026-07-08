import { useMemo, useRef, useState } from "react";
import type {
  WorldGeographyDirection,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";

interface WorldVisualizationBoardProps {
  payload?: WorldVisualizationPayload;
}

type GraphNode = {
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

type GraphEdge = {
  source: string;
  target: string;
  relation: string;
  routeType?: string;
  distanceHint?: string;
  direction?: WorldGeographyDirection;
  risk?: string;
};

type Point = { x: number; y: number };

type LabelPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Obstacle = LabelPlacement & {
  id?: string;
};

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

function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, maxLength - 1))}…`;
}

function getNodeBadgeText(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

const FACTION_TYPE_LABELS: Record<string, string> = {
  all: "全部类型",
  state: "政权",
  faction: "阵营",
  race: "种族",
  organization: "组织",
  other: "其他",
};

const FACTION_TYPE_COLORS: Record<string, string> = {
  state: "#2563eb",
  faction: "#16a34a",
  race: "#ea580c",
  organization: "#7c3aed",
  other: "#64748b",
};

function buildCircularLayout(nodes: GraphNode[], width: number, height: number) {
  const radius = Math.min(width, height) * 0.32;
  const centerX = width / 2;
  const centerY = height / 2;
  const result = new Map<string, { x: number; y: number }>();

  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    result.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });
  return result;
}

function buildMapLayout(nodes: GraphNode[], width: number, height: number) {
  const result = new Map<string, { x: number; y: number }>();
  const fallback = buildCircularLayout(nodes, width, height);
  const paddingX = 72;
  const paddingY = 54;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  nodes.forEach((node) => {
    const x = typeof node.x === "number" && Number.isFinite(node.x)
      ? Math.max(4, Math.min(96, node.x))
      : undefined;
    const y = typeof node.y === "number" && Number.isFinite(node.y)
      ? Math.max(4, Math.min(96, node.y))
      : undefined;
    const fallbackPoint = fallback.get(node.id) ?? { x: width / 2, y: height / 2 };
    result.set(node.id, {
      x: x == null ? fallbackPoint.x : paddingX + (x / 100) * innerWidth,
      y: y == null ? fallbackPoint.y : paddingY + (y / 100) * innerHeight,
    });
  });
  return result;
}

function getMapLabelMeta(node: GraphNode): string {
  return [
    node.directionHint ? DIRECTION_LABELS[node.directionHint] : "",
    node.terrain ? truncateText(node.terrain, 8) : "",
    node.risk ? "风险" : "",
  ].filter(Boolean).join(" / ");
}

function getLabelSize(node: GraphNode, layout: "graph" | "map") {
  const labelLines = wrapLabel(node.label, layout === "map" ? 5 : 6, layout === "map" ? 2 : 3);
  const metaText = layout === "map" ? getMapLabelMeta(node) : "";
  const longestLine = Math.max(...labelLines.map((line) => line.length), metaText.length, 0);
  return {
    labelLines,
    metaText,
    width: Math.max(layout === "map" ? 82 : 72, Math.min(layout === "map" ? 132 : 150, longestLine * 12 + 20)),
    height: Math.max(28, labelLines.length * 15 + 10 + (metaText ? 14 : 0)),
  };
}

function getMapLabelCandidates(point: Point, width: number, height: number, direction?: WorldGeographyDirection) {
  const candidates: Array<{ x: number; y: number }> = [];
  const pushCandidate = (
    anchor: "top" | "bottom" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight",
    distance = 1,
  ) => {
    const verticalGap = 32 + (distance - 1) * 34;
    const horizontalGap = 34 + (distance - 1) * 40;
    const diagonalGap = 22 + (distance - 1) * 36;
    if (anchor === "top") {
      candidates.push({ x: point.x - width / 2, y: point.y - height - verticalGap });
    } else if (anchor === "bottom") {
      candidates.push({ x: point.x - width / 2, y: point.y + verticalGap });
    } else if (anchor === "left") {
      candidates.push({ x: point.x - width - horizontalGap, y: point.y - height / 2 });
    } else if (anchor === "right") {
      candidates.push({ x: point.x + horizontalGap, y: point.y - height / 2 });
    } else if (anchor === "topLeft") {
      candidates.push({ x: point.x - width - diagonalGap, y: point.y - height - diagonalGap });
    } else if (anchor === "topRight") {
      candidates.push({ x: point.x + diagonalGap, y: point.y - height - diagonalGap });
    } else if (anchor === "bottomLeft") {
      candidates.push({ x: point.x - width - diagonalGap, y: point.y + diagonalGap });
    } else if (anchor === "bottomRight") {
      candidates.push({ x: point.x + diagonalGap, y: point.y + diagonalGap });
    }
  };

  if (direction === "north") {
    pushCandidate("bottom");
    pushCandidate("right");
    pushCandidate("left");
  } else if (direction === "south") {
    pushCandidate("top");
    pushCandidate("right");
    pushCandidate("left");
  } else if (direction === "east") {
    pushCandidate("left");
    pushCandidate("bottomLeft");
    pushCandidate("topLeft");
  } else if (direction === "west") {
    pushCandidate("right");
    pushCandidate("bottomRight");
    pushCandidate("topRight");
  } else if (direction === "northeast") {
    pushCandidate("bottomLeft");
    pushCandidate("left");
    pushCandidate("bottom");
  } else if (direction === "northwest") {
    pushCandidate("bottomRight");
    pushCandidate("right");
    pushCandidate("bottom");
  } else if (direction === "southeast") {
    pushCandidate("topLeft");
    pushCandidate("left");
    pushCandidate("top");
  } else if (direction === "southwest") {
    pushCandidate("topRight");
    pushCandidate("right");
    pushCandidate("top");
  }

  pushCandidate("bottom");
  pushCandidate("top");
  pushCandidate("right");
  pushCandidate("left");
  pushCandidate("bottomRight");
  pushCandidate("bottomLeft");
  pushCandidate("topRight");
  pushCandidate("topLeft");

  for (const distance of [2, 3]) {
    pushCandidate("bottom", distance);
    pushCandidate("top", distance);
    pushCandidate("right", distance);
    pushCandidate("left", distance);
    pushCandidate("bottomRight", distance);
    pushCandidate("bottomLeft", distance);
    pushCandidate("topRight", distance);
    pushCandidate("topLeft", distance);
  }
  return candidates;
}

function overlaps(a: LabelPlacement, b: LabelPlacement): boolean {
  const gap = 6;
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function clampPlacement(candidate: LabelPlacement, width: number, height: number): LabelPlacement {
  return {
    ...candidate,
    x: Math.max(10, Math.min(width - candidate.width - 10, candidate.x)),
    y: Math.max(10, Math.min(height - candidate.height - 10, candidate.y)),
  };
}

function getNodeObstacle(id: string, point: Point): Obstacle {
  const size = 58;
  return {
    id,
    x: point.x - size / 2,
    y: point.y - size / 2,
    width: size,
    height: size,
  };
}

function getCrowdingScore(node: GraphNode, positions: Map<string, Point>): number {
  const point = positions.get(node.id);
  if (!point) {
    return 0;
  }
  let score = 0;
  positions.forEach((other, otherId) => {
    if (otherId === node.id) {
      return;
    }
    const distance = Math.hypot(point.x - other.x, point.y - other.y);
    score += 1 / Math.max(24, distance);
  });
  return score;
}

function buildLabelPlacements(
  nodes: GraphNode[],
  positions: Map<string, Point>,
  width: number,
  height: number,
  layout: "graph" | "map",
) {
  const result = new Map<string, LabelPlacement>();
  if (layout !== "map") {
    nodes.forEach((node) => {
      const point = positions.get(node.id);
      if (!point) {
        return;
      }
      const size = getLabelSize(node, layout);
      result.set(node.id, {
        x: point.x - size.width / 2,
        y: point.y + 32,
        width: size.width,
        height: size.height,
      });
    });
    return result;
  }

  const nodeObstacles = nodes
    .map((node) => {
      const point = positions.get(node.id);
      return point ? getNodeObstacle(node.id, point) : null;
    })
    .filter((item): item is Obstacle => Boolean(item));
  const placed: LabelPlacement[] = [];
  const sortedNodes = [...nodes].sort((a, b) => {
    return getCrowdingScore(b, positions) - getCrowdingScore(a, positions);
  });

  sortedNodes.forEach((node) => {
    const point = positions.get(node.id);
    if (!point) {
      return;
    }
    const size = getLabelSize(node, layout);
    const candidates = getMapLabelCandidates(point, size.width, size.height, node.directionHint)
      .map((candidate) => clampPlacement({ ...candidate, width: size.width, height: size.height }, width, height));
    const selected = candidates.find((candidate) => {
      const overlapsPlaced = placed.some((item) => overlaps(candidate, item));
      const overlapsNode = nodeObstacles.some((item) => item.id !== node.id && overlaps(candidate, item));
      return !overlapsPlaced && !overlapsNode;
    })
      ?? candidates.find((candidate) => !nodeObstacles.some((item) => item.id !== node.id && overlaps(candidate, item)))
      ?? candidates.find((candidate) => !placed.some((item) => overlaps(candidate, item)))
      ?? candidates[0]
      ?? { x: point.x - size.width / 2, y: point.y + 32, width: size.width, height: size.height };
    placed.push(selected);
    result.set(node.id, selected);
  });
  return result;
}

function getRiskTone(risk?: string): string {
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

const ROUTE_STYLES: Record<string, { stroke: string; dash?: string }> = {
  road: { stroke: "#64748b" },
  river: { stroke: "#0284c7", dash: "6 5" },
  sea: { stroke: "#2563eb", dash: "10 6" },
  portal: { stroke: "#7c3aed", dash: "3 5" },
  trade: { stroke: "#16a34a", dash: "8 5" },
  military: { stroke: "#dc2626", dash: "5 4" },
  border: { stroke: "#f59e0b", dash: "4 4" },
  other: { stroke: "#64748b" },
};

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

function DraggableGraph(props: {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  colorByType?: (type?: string) => string;
  layout?: "graph" | "map";
}) {
  const { title, nodes, edges, colorByType, layout = "graph" } = props;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastPoint, setLastPoint] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const width = layout === "map" ? 960 : 860;
  const height = layout === "map" ? 460 : 380;
  const positions = useMemo(
    () => (layout === "map" ? buildMapLayout(nodes, width, height) : buildCircularLayout(nodes, width, height)),
    [layout, nodes],
  );
  const labelPlacements = useMemo(
    () => buildLabelPlacements(nodes, positions, width, height, layout),
    [height, layout, nodes, positions, width],
  );

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true);
    setLastPoint({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    const dx = event.clientX - lastPoint.x;
    const dy = event.clientY - lastPoint.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastPoint({ x: event.clientX, y: event.clientY });
  };

  const stopDragging = () => {
    setDragging(false);
  };

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">缩放</span>
          <input
            type="range"
            min={0.6}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <Button size="sm" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            重置
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="overflow-hidden rounded border bg-muted/30"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        role="presentation"
      >
        <svg viewBox={`0 0 ${width} ${height}`} className={layout === "map" ? "h-[430px] w-full" : "h-[360px] w-full"}>
          {layout === "map" ? (
            <g>
              <defs>
                <pattern id="world-map-grid" width="43" height="38" patternUnits="userSpaceOnUse">
                  <path d="M 43 0 L 0 0 0 38" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={width} height={height} fill="#f8fafc" />
              <rect width={width} height={height} fill="url(#world-map-grid)" />
              <path
                d="M78 322 C154 272 220 296 292 246 C384 182 486 202 568 152 C688 80 784 132 884 94"
                fill="none"
                stroke="rgba(14,165,233,0.13)"
                strokeWidth="38"
                strokeLinecap="round"
              />
              <path
                d="M112 96 C202 142 292 112 404 150 C512 188 612 146 744 208 C824 246 872 300 918 358"
                fill="none"
                stroke="rgba(34,197,94,0.10)"
                strokeWidth="52"
                strokeLinecap="round"
              />
              <g fontSize={13} fontWeight={700} fill="#475569">
                <text x={width / 2} y={24} textAnchor="middle">北</text>
                <text x={width / 2} y={height - 14} textAnchor="middle">南</text>
                <text x={20} y={height / 2} textAnchor="middle">西</text>
                <text x={width - 20} y={height / 2} textAnchor="middle">东</text>
              </g>
            </g>
          ) : null}
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {edges.map((edge, edgeIndex) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) {
                return null;
              }
              const relationLabel = layout === "map" ? truncateText(edge.relation, 6) : edge.relation;
              const labelWidth = Math.max(48, relationLabel.length * 12);
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const length = Math.hypot(dx, dy) || 1;
              const offsetSign = edgeIndex % 2 === 0 ? 1 : -1;
              const offset = layout === "map" ? 16 * offsetSign : 0;
              const labelX = (from.x + to.x) / 2 + (-dy / length) * offset;
              const labelY = (from.y + to.y) / 2 + (dx / length) * offset;
              const routeStyle = ROUTE_STYLES[edge.routeType ?? "other"] ?? ROUTE_STYLES.other;
              return (
                <g key={`${edge.source}-${edge.target}-${edge.relation}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={layout === "map" ? routeStyle.stroke : "hsl(var(--muted-foreground))"}
                    strokeOpacity={layout === "map" ? 0.74 : 0.5}
                    strokeWidth={layout === "map" ? 3 : 2}
                    strokeDasharray={layout === "map" ? routeStyle.dash : undefined}
                  />
                  <rect
                    x={labelX - labelWidth / 2}
                    y={labelY - 10}
                    width={labelWidth}
                    height={20}
                    rx={10}
                    fill={layout === "map" ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.92)"}
                    stroke={layout === "map" ? "rgba(148,163,184,0.38)" : "rgba(148,163,184,0.55)"}
                  />
                  <text
                    x={labelX}
                    y={labelY + 4}
                    fill="#334155"
                    fontSize={layout === "map" ? 11 : 12}
                    fontWeight={600}
                    textAnchor="middle"
                  >
                    {relationLabel}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => {
              const point = positions.get(node.id);
              if (!point) {
                return null;
              }
              const fill = layout === "map" ? getRiskTone(node.risk) : colorByType ? colorByType(node.type) : "hsl(var(--primary))";
              const { labelLines, metaText } = getLabelSize(node, layout);
              const placement = labelPlacements.get(node.id);
              if (!placement) {
                return null;
              }
              const labelCenter = {
                x: placement.x + placement.width / 2,
                y: placement.y + placement.height / 2,
              };
              return (
                <g key={node.id}>
                  <title>
                    {[node.label, node.summary, node.storyRelevance, node.risk].filter(Boolean).join("\n")}
                  </title>
                  {layout === "map" ? (
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={labelCenter.x}
                      y2={labelCenter.y}
                      stroke="rgba(71,85,105,0.34)"
                      strokeWidth={1.2}
                      strokeDasharray="3 4"
                    />
                  ) : null}
                  {layout === "map" ? (
                    <circle cx={point.x} cy={point.y} r={28} fill={fill} opacity={0.14} />
                  ) : null}
                  <circle cx={point.x} cy={point.y} r={layout === "map" ? 18 : 22} fill={fill} opacity={0.92} />
                  <text
                    x={point.x}
                    y={point.y + 4}
                    fill="white"
                    fontSize={11}
                    fontWeight={700}
                    textAnchor="middle"
                    style={{ pointerEvents: "none" }}
                  >
                    {getNodeBadgeText(node.label)}
                  </text>
                  <rect
                    x={placement.x}
                    y={placement.y}
                    width={placement.width}
                    height={placement.height}
                    rx={8}
                    fill="rgba(255,255,255,0.96)"
                    stroke="rgba(148,163,184,0.55)"
                  />
                  {labelLines.map((line, index) => (
                    <text
                      key={`${node.id}-${line}-${index}`}
                      x={placement.x + placement.width / 2}
                      y={placement.y + 18 + index * 15}
                      fill="#0f172a"
                      fontSize={12}
                      fontWeight={600}
                      textAnchor="middle"
                      style={{ pointerEvents: "none" }}
                    >
                      {line}
                    </text>
                  ))}
                  {metaText ? (
                    <text
                      x={placement.x + placement.width / 2}
                      y={placement.y + 18 + labelLines.length * 15}
                      fill="#64748b"
                      fontSize={10}
                      fontWeight={600}
                      textAnchor="middle"
                      style={{ pointerEvents: "none" }}
                    >
                      {metaText}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        拖动画布可移动视图，使用滑块调整缩放。
      </div>
    </div>
  );
}

export default function WorldVisualizationBoard({ payload }: WorldVisualizationBoardProps) {
  const [mode, setMode] = useState<"faction" | "geography" | "power" | "timeline">("faction");
  const [keyword, setKeyword] = useState("");
  const [factionType, setFactionType] = useState("all");
  const [timelineLimit, setTimelineLimit] = useState(8);

  const factionTypeOptions = useMemo(() => {
    const types = Array.from(
      new Set((payload?.factionGraph.nodes ?? []).map((node) => node.type?.trim()).filter(Boolean)),
    );
    return ["all", ...types];
  }, [payload?.factionGraph.nodes]);

  const factionNodes = useMemo(() => {
    const source = payload?.factionGraph.nodes ?? [];
    return source.filter((node) => {
      const matchType = factionType === "all" ? true : node.type === factionType;
      const matchKeyword = keyword.trim()
        ? node.label.toLowerCase().includes(keyword.trim().toLowerCase())
        : true;
      return matchType && matchKeyword;
    });
  }, [factionType, keyword, payload?.factionGraph.nodes]);

  const factionNodeIds = useMemo(() => new Set(factionNodes.map((node) => node.id)), [factionNodes]);

  const factionEdges = useMemo(
    () =>
      (payload?.factionGraph.edges ?? []).filter(
        (edge) => factionNodeIds.has(edge.source) && factionNodeIds.has(edge.target),
      ),
    [factionNodeIds, payload?.factionGraph.edges],
  );

  const geographyNodes = useMemo(() => {
    const source = payload?.geographyMap.nodes ?? [];
    return source.filter((node) =>
      keyword.trim() ? node.label.toLowerCase().includes(keyword.trim().toLowerCase()) : true,
    );
  }, [keyword, payload?.geographyMap.nodes]);

  const geographyNodeIds = useMemo(
    () => new Set(geographyNodes.map((node) => node.id)),
    [geographyNodes],
  );

  const geographyEdges = useMemo(
    () =>
      (payload?.geographyMap.edges ?? []).filter(
        (edge) => geographyNodeIds.has(edge.source) && geographyNodeIds.has(edge.target),
      ),
    [geographyNodeIds, payload?.geographyMap.edges],
  );

  const filteredPower = useMemo(() => {
    const source = payload?.powerTree ?? [];
    if (!keyword.trim()) {
      return source;
    }
    const lower = keyword.trim().toLowerCase();
    return source.filter(
      (item) =>
        item.level.toLowerCase().includes(lower)
        || item.description.toLowerCase().includes(lower),
    );
  }, [keyword, payload?.powerTree]);

  const filteredTimeline = useMemo(() => {
    const source = payload?.timeline ?? [];
    const byKeyword = keyword.trim()
      ? source.filter((item) =>
        `${item.year} ${item.event}`.toLowerCase().includes(keyword.trim().toLowerCase()),
      )
      : source;
    return byKeyword.slice(0, timelineLimit);
  }, [keyword, payload?.timeline, timelineLimit]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mode === "faction" ? "default" : "secondary"} onClick={() => setMode("faction")}>
          势力图谱
        </Button>
        <Button size="sm" variant={mode === "geography" ? "default" : "secondary"} onClick={() => setMode("geography")}>
          地理地图
        </Button>
        <Button size="sm" variant={mode === "power" ? "default" : "secondary"} onClick={() => setMode("power")}>
          力量体系
        </Button>
        <Button size="sm" variant={mode === "timeline" ? "default" : "secondary"} onClick={() => setMode("timeline")}>
          世界时间线
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="按名称或关键词筛选"
        />
        {mode === "faction" ? (
          <SelectControl
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={factionType}
            onChange={(event) => setFactionType(event.target.value)}
          >
            {factionTypeOptions.map((type) => (
              <option key={type} value={type}>
                {FACTION_TYPE_LABELS[type] ?? type}
              </option>
            ))}
          </SelectControl>
        ) : (
          <div />
        )}
        {mode === "timeline" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>显示数量</span>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={timelineLimit}
              onChange={(event) => setTimelineLimit(Number(event.target.value))}
            />
            <span>{timelineLimit}</span>
          </div>
        ) : (
          <div />
        )}
      </div>

      {mode === "faction" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {factionTypeOptions
              .filter((type) => type !== "all")
              .map((type) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: FACTION_TYPE_COLORS[type] ?? FACTION_TYPE_COLORS.other }}
                  />
                  <span>{FACTION_TYPE_LABELS[type] ?? type}</span>
                </div>
              ))}
          </div>
          <DraggableGraph
            title={`势力图谱（${factionNodes.length} 个节点）`}
            nodes={factionNodes}
            edges={factionEdges}
            colorByType={(type) => FACTION_TYPE_COLORS[type ?? "other"] ?? FACTION_TYPE_COLORS.other}
          />
        </div>
      ) : null}

      {mode === "geography" ? (
        <DraggableGraph
          title={`世界地图（${geographyNodes.length} 个地点）`}
          nodes={geographyNodes}
          edges={geographyEdges}
          colorByType={() => "#ea580c"}
          layout="map"
        />
      ) : null}

      {mode === "power" ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">力量体系（{filteredPower.length} 项）</div>
          <div className="space-y-2">
            {filteredPower.map((item) => (
              <div key={`${item.level}-${item.description}`} className="rounded border p-2">
                <div className="text-xs font-semibold text-muted-foreground">{item.level}</div>
                <div>{item.description}</div>
              </div>
            ))}
            {filteredPower.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无匹配内容</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "timeline" ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">世界时间线（{filteredTimeline.length} 条）</div>
          <div className="space-y-2">
            {filteredTimeline.map((item, index) => (
              <div key={`${item.year}-${item.event}-${index}`} className="flex gap-3 rounded border p-2">
                <div className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{item.year}</div>
                <div>{item.event}</div>
              </div>
            ))}
            {filteredTimeline.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无匹配内容</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
