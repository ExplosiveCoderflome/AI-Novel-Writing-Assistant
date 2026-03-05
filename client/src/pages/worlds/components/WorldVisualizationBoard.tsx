import { useMemo, useRef, useState } from "react";
import type { WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WorldVisualizationBoardProps {
  payload?: WorldVisualizationPayload;
}

type GraphNode = {
  id: string;
  label: string;
  type?: string;
};

type GraphEdge = {
  source: string;
  target: string;
  relation: string;
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

function DraggableGraph(props: {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  colorByType?: (type?: string) => string;
}) {
  const { title, nodes, edges, colorByType } = props;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastPoint, setLastPoint] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const width = 860;
  const height = 380;
  const positions = useMemo(() => buildCircularLayout(nodes, width, height), [nodes]);

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
          <span className="text-xs text-muted-foreground">zoom</span>
          <input
            type="range"
            min={0.6}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <Button size="sm" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            reset
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
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full">
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {edges.map((edge) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) {
                return null;
              }
              return (
                <g key={`${edge.source}-${edge.target}-${edge.relation}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2}
                    fill="hsl(var(--muted-foreground))"
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {edge.relation}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => {
              const point = positions.get(node.id);
              if (!point) {
                return null;
              }
              const fill = colorByType ? colorByType(node.type) : "hsl(var(--primary))";
              return (
                <g key={node.id}>
                  <circle cx={point.x} cy={point.y} r={23} fill={fill} opacity={0.85} />
                  <text
                    x={point.x}
                    y={point.y + 4}
                    fill="white"
                    fontSize={10}
                    textAnchor="middle"
                    style={{ pointerEvents: "none" }}
                  >
                    {node.label.length > 10 ? `${node.label.slice(0, 10)}...` : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        drag canvas to pan; use slider to zoom
      </div>
    </div>
  );
}

export default function WorldVisualizationBoard({ payload }: WorldVisualizationBoardProps) {
  const [mode, setMode] = useState<"faction" | "geography" | "power" | "timeline">("faction");
  const [keyword, setKeyword] = useState("");
  const [factionType, setFactionType] = useState<"all" | "state" | "faction">("all");
  const [timelineLimit, setTimelineLimit] = useState(8);

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
          Factions
        </Button>
        <Button size="sm" variant={mode === "geography" ? "default" : "secondary"} onClick={() => setMode("geography")}>
          Geography
        </Button>
        <Button size="sm" variant={mode === "power" ? "default" : "secondary"} onClick={() => setMode("power")}>
          Power Tree
        </Button>
        <Button size="sm" variant={mode === "timeline" ? "default" : "secondary"} onClick={() => setMode("timeline")}>
          Timeline
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="filter keyword"
        />
        {mode === "faction" ? (
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={factionType}
            onChange={(event) => setFactionType(event.target.value as "all" | "state" | "faction")}
          >
            <option value="all">all types</option>
            <option value="state">state</option>
            <option value="faction">faction</option>
          </select>
        ) : (
          <div />
        )}
        {mode === "timeline" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>max</span>
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
        <DraggableGraph
          title={`Faction Graph (${factionNodes.length} nodes)`}
          nodes={factionNodes}
          edges={factionEdges}
          colorByType={(type) => (type === "state" ? "#2563eb" : "#16a34a")}
        />
      ) : null}

      {mode === "geography" ? (
        <DraggableGraph
          title={`Geography Map (${geographyNodes.length} nodes)`}
          nodes={geographyNodes}
          edges={geographyEdges}
          colorByType={() => "#ea580c"}
        />
      ) : null}

      {mode === "power" ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Power Tree ({filteredPower.length})</div>
          <div className="space-y-2">
            {filteredPower.map((item) => (
              <div key={`${item.level}-${item.description}`} className="rounded border p-2">
                <div className="text-xs font-semibold text-muted-foreground">{item.level}</div>
                <div>{item.description}</div>
              </div>
            ))}
            {filteredPower.length === 0 ? (
              <div className="text-xs text-muted-foreground">no data</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "timeline" ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Timeline ({filteredTimeline.length})</div>
          <div className="space-y-2">
            {filteredTimeline.map((item, index) => (
              <div key={`${item.year}-${item.event}-${index}`} className="flex gap-3 rounded border p-2">
                <div className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{item.year}</div>
                <div>{item.event}</div>
              </div>
            ))}
            {filteredTimeline.length === 0 ? (
              <div className="text-xs text-muted-foreground">no data</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

