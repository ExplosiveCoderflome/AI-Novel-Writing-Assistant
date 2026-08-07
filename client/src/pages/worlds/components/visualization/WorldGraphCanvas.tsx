import { useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import FullscreenView from "@/components/common/FullscreenView";
import { Button } from "@/components/ui/button";
import {
  ROUTE_STYLES,
  buildEdgeLabelPlacements,
  buildFactionLayout,
  buildLabelPlacements,
  buildMapLayout,
  getLabelSize,
  getNodeBadgeText,
  getRiskTone,
  type GraphEdge,
  type GraphNode,
} from "./worldGraphLayout";

interface WorldGraphCanvasProps {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  colorByType?: (type?: string) => string;
  layout?: "graph" | "map";
}

export default function WorldGraphCanvas({
  title,
  nodes,
  edges,
  colorByType,
  layout = "graph",
}: WorldGraphCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPoint, setLastPoint] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = layout === "map" ? 1040 : 960;
  const height = layout === "map" ? 540 : 480;
  const positions = useMemo(
    () => layout === "map" ? buildMapLayout(nodes, width, height) : buildFactionLayout(nodes, width, height),
    [layout, nodes],
  );
  const labelPlacements = useMemo(
    () => buildLabelPlacements(nodes, positions, width, height, layout),
    [height, layout, nodes, positions, width],
  );
  const edgeLabelPlacements = useMemo(
    () => buildEdgeLabelPlacements(edges, positions, labelPlacements, width, height, layout),
    [edges, height, labelPlacements, layout, positions, width],
  );

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

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
    setPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
    setLastPoint({ x: event.clientX, y: event.clientY });
  };

  return (
    <FullscreenView
      title={title}
      description={layout === "map" ? "地点按相对方位铺开，地点、名称和路线文字会自动避让。" : "节点按势力类型分散排布，势力名称和关系文字会自动避让。"}
      fullscreen={isFullscreen}
      onFullscreenChange={setIsFullscreen}
      toggleLabel="全屏查看图谱"
      exitLabel="退出图谱全屏"
      className="rounded-3xl border-border/35 shadow-none"
      headerClassName="bg-none px-5 py-4"
      bodyClassName="flex min-h-0 flex-col"
      fullscreenBodyClassName="h-full"
      actions={(
        <div className="flex items-center gap-1 rounded-full bg-muted/35 p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))}
            aria-label="缩小图谱"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}
            aria-label="放大图谱"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={resetView} aria-label="重置图谱视图">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
    >

      <div
        ref={containerRef}
        className={`min-h-0 flex-1 overflow-hidden bg-muted/[0.12] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        role="img"
        aria-label={title}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={isFullscreen ? "h-full min-h-[520px] w-full" : layout === "map" ? "h-[500px] w-full" : "h-[450px] w-full"}
        >
          {layout === "map" ? (
            <g>
              <defs>
                <pattern id="world-map-grid" width="52" height="46" patternUnits="userSpaceOnUse">
                  <path d="M 52 0 L 0 0 0 46" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1" />
                </pattern>
                <radialGradient id="world-map-wash" cx="50%" cy="45%" r="70%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="100%" stopColor="rgba(241,245,249,0.82)" />
                </radialGradient>
              </defs>
              <rect width={width} height={height} fill="url(#world-map-wash)" />
              <rect width={width} height={height} fill="url(#world-map-grid)" />
              <path d="M70 400 C188 318 274 350 380 278 C500 196 620 230 724 164 C830 96 904 138 982 86" fill="none" stroke="rgba(14,165,233,0.10)" strokeWidth="42" strokeLinecap="round" />
              <path d="M92 108 C230 176 338 120 474 170 C610 220 732 184 938 382" fill="none" stroke="rgba(34,197,94,0.075)" strokeWidth="58" strokeLinecap="round" />
              <g fontSize={12} fontWeight={700} fill="#64748b">
                <text x={width / 2} y={25} textAnchor="middle">北</text>
                <text x={width / 2} y={height - 15} textAnchor="middle">南</text>
                <text x={22} y={height / 2} textAnchor="middle">西</text>
                <text x={width - 22} y={height / 2} textAnchor="middle">东</text>
              </g>
            </g>
          ) : (
            <defs>
              <radialGradient id="faction-canvas-wash" cx="50%" cy="50%" r="72%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
                <stop offset="100%" stopColor="rgba(248,250,252,0.68)" />
              </radialGradient>
            </defs>
          )}
          {layout === "graph" ? <rect width={width} height={height} fill="url(#faction-canvas-wash)" /> : null}

          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {edges.map((edge, edgeIndex) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              const labelPlacement = edgeLabelPlacements[edgeIndex];
              if (!from || !to || !labelPlacement) {
                return null;
              }
              const routeStyle = ROUTE_STYLES[edge.routeType ?? "other"] ?? ROUTE_STYLES.other;
              return (
                <g key={`${edge.source}-${edge.target}-${edge.relation}-${edgeIndex}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={layout === "map" ? routeStyle.stroke : "#94a3b8"}
                    strokeOpacity={layout === "map" ? 0.62 : 0.52}
                    strokeWidth={layout === "map" ? 2.5 : 1.8}
                    strokeDasharray={layout === "map" ? routeStyle.dash : undefined}
                  />
                  {labelPlacement.label ? (
                    <g>
                      <rect
                        x={labelPlacement.x}
                        y={labelPlacement.y}
                        width={labelPlacement.width}
                        height={labelPlacement.height}
                        rx={11}
                        fill="rgba(255,255,255,0.92)"
                        stroke="rgba(148,163,184,0.34)"
                      />
                      <text
                        x={labelPlacement.x + labelPlacement.width / 2}
                        y={labelPlacement.y + 15}
                        fill="#475569"
                        fontSize={10.5}
                        fontWeight={600}
                        textAnchor="middle"
                      >
                        {labelPlacement.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {nodes.map((node) => {
              const point = positions.get(node.id);
              const placement = labelPlacements.get(node.id);
              if (!point || !placement) {
                return null;
              }
              const fill = layout === "map" ? getRiskTone(node.risk) : colorByType?.(node.type) ?? "hsl(var(--primary))";
              const { labelLines, metaText } = getLabelSize(node, layout);
              const labelCenter = { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };
              return (
                <g key={node.id}>
                  <title>{[node.label, node.summary, node.storyRelevance, node.risk].filter(Boolean).join("\n")}</title>
                  <line x1={point.x} y1={point.y} x2={labelCenter.x} y2={labelCenter.y} stroke="rgba(100,116,139,0.28)" strokeWidth={1.1} strokeDasharray="3 4" />
                  <circle cx={point.x} cy={point.y} r={layout === "map" ? 30 : 28} fill={fill} opacity={0.11} />
                  <circle cx={point.x} cy={point.y} r={layout === "map" ? 17 : 20} fill={fill} opacity={0.94} />
                  <text x={point.x} y={point.y + 4} fill="white" fontSize={10.5} fontWeight={700} textAnchor="middle" style={{ pointerEvents: "none" }}>
                    {getNodeBadgeText(node.label)}
                  </text>
                  <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={10} fill="rgba(255,255,255,0.97)" stroke="rgba(148,163,184,0.42)" />
                  {labelLines.map((line, index) => (
                    <text key={`${node.id}-${index}`} x={placement.x + placement.width / 2} y={placement.y + 18 + index * 15} fill="#0f172a" fontSize={11.5} fontWeight={650} textAnchor="middle" style={{ pointerEvents: "none" }}>
                      {line}
                    </text>
                  ))}
                  {metaText ? (
                    <text x={placement.x + placement.width / 2} y={placement.y + 18 + labelLines.length * 15} fill="#64748b" fontSize={9.5} fontWeight={600} textAnchor="middle" style={{ pointerEvents: "none" }}>
                      {metaText}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="border-t border-border/25 px-5 py-3 text-xs text-muted-foreground">拖动画布移动视图，使用右上角按钮缩放或重置。</div>
    </FullscreenView>
  );
}
