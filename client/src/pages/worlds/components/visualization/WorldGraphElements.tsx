import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { MapPin, Network, Route, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNodeBadgeText,
  getRouteStyle,
  type GraphEdge,
  type GraphLayout,
  type GraphNode,
} from "./worldGraphLayout";

export interface WorldGraphNodeData extends Record<string, unknown> {
  graphNode: GraphNode;
  layout: GraphLayout;
  tone: string;
  active: boolean;
  dimmed: boolean;
}

export interface WorldGraphEdgeData extends Record<string, unknown> {
  graphEdge: GraphEdge;
  layout: GraphLayout;
  sourceLabel: string;
  targetLabel: string;
  shortLabel: string;
  labelVisible: boolean;
  active: boolean;
  dimmed: boolean;
  detailOpen: boolean;
  detailPinned: boolean;
  onHoverChange: (edgeId: string | null) => void;
  onSelect: (edgeId: string) => void;
}

export type WorldFlowNode = Node<WorldGraphNodeData, "worldNode">;
export type WorldFlowEdge = Edge<WorldGraphEdgeData, "worldEdge">;

const HANDLE_POSITIONS = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const NODE_TYPE_LABELS: Record<string, string> = {
  state: "政权",
  faction: "阵营",
  race: "种族",
  organization: "组织",
  other: "其他势力",
};

function handleName(position: Position) {
  return String(position).toLowerCase();
}

export function WorldGraphNode(props: NodeProps<WorldFlowNode>) {
  const { graphNode, layout, tone, active, dimmed } = props.data;
  const isMap = layout === "map";
  const metaText = isMap
    ? graphNode.terrain || graphNode.regionType || "关键地点"
    : NODE_TYPE_LABELS[graphNode.type ?? "other"] ?? graphNode.type ?? "世界势力";
  const detailItems = [
    `类型：${metaText}`,
    graphNode.summary,
    graphNode.storyRelevance ? `故事作用：${graphNode.storyRelevance}` : "",
    graphNode.risk ? `风险：${graphNode.risk}` : "",
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "group relative h-full w-full rounded-2xl border bg-background/95 px-3.5 py-3 shadow-sm transition-[opacity,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        active && "shadow-md ring-2 ring-primary/15",
        dimmed && "opacity-35",
      )}
      style={{ borderColor: active ? tone : undefined }}
      tabIndex={0}
      aria-label={`${graphNode.label}，${metaText}`}
    >
      {HANDLE_POSITIONS.flatMap((position) => [
        <Handle
          key={`target-${position}`}
          id={`target-${handleName(position)}`}
          type="target"
          position={position}
          isConnectable={false}
          className="!h-2 !w-2 !border-0 !bg-transparent"
        />,
        <Handle
          key={`source-${position}`}
          id={`source-${handleName(position)}`}
          type="source"
          position={position}
          isConnectable={false}
          className="!h-2 !w-2 !border-0 !bg-transparent"
        />,
      ])}

      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl font-semibold text-white",
            isMap ? "h-9 w-9 text-[11px]" : "h-11 w-11 text-xs",
          )}
          style={{ backgroundColor: tone }}
        >
          {getNodeBadgeText(graphNode.label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(
            "break-words font-semibold leading-5 text-foreground",
            isMap ? "truncate text-sm" : "line-clamp-2 text-[15px]",
          )}>
            {graphNode.label}
          </div>
          <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
            {isMap ? <MapPin className="h-3 w-3 shrink-0" /> : <Network className="h-3 w-3 shrink-0" />}
            <span className="truncate">{metaText}</span>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 hidden w-72 -translate-x-1/2 rounded-2xl border border-border/60 bg-popover p-3 text-left text-xs leading-5 text-popover-foreground shadow-lg",
          "group-hover:block group-focus-within:block",
        )}
        role="tooltip"
      >
        <div className="break-words text-sm font-semibold leading-6">{graphNode.label}</div>
        <div className="mt-1.5 space-y-1 text-muted-foreground">
          {detailItems.map((item, index) => <div key={`${graphNode.id}-${index}`}>{item}</div>)}
        </div>
      </div>
    </div>
  );
}

export function WorldGraphEdge(props: EdgeProps<WorldFlowEdge>) {
  const data = props.data;
  const [edgePath, labelX, labelY] = getStraightPath(props);
  if (!data) return null;
  const routeStyle = getRouteStyle(data.graphEdge.routeType);
  const stroke = data.layout === "map" ? routeStyle.stroke : "hsl(var(--muted-foreground))";
  const lineOpacity = data.dimmed ? 0.16 : data.active ? 0.95 : data.layout === "map" ? 0.64 : 0.5;
  const showShortLabel = data.labelVisible || data.detailOpen;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        interactionWidth={28}
        style={{
          stroke,
          strokeWidth: data.active ? 3.2 : data.layout === "map" ? 2.4 : 1.8,
          strokeDasharray: data.layout === "map" ? routeStyle.dash : undefined,
          opacity: lineOpacity,
          transition: "opacity 150ms ease, stroke-width 150ms ease",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute z-20"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onMouseEnter={() => data.onHoverChange(props.id)}
          onMouseLeave={() => data.onHoverChange(null)}
        >
          {showShortLabel ? (
            <button
              type="button"
              className={cn(
                "rounded-full border border-border/55 bg-background/95 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors",
                data.active && "border-primary/30 text-foreground",
              )}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelect(props.id);
              }}
              aria-label={`${data.sourceLabel}与${data.targetLabel}：${data.graphEdge.relation}`}
            >
              {data.shortLabel}
            </button>
          ) : null}

          {data.detailOpen ? (
            <div
              className="absolute left-1/2 top-[calc(100%+8px)] z-30 w-64 -translate-x-1/2 rounded-2xl border border-border/60 bg-popover p-3 text-left text-xs text-popover-foreground shadow-lg"
              role="tooltip"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <Network className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{data.sourceLabel}</span>
                <span className="text-muted-foreground">→</span>
                <span className="truncate">{data.targetLabel}</span>
              </div>
              <div className="mt-2 leading-5 text-muted-foreground">{data.graphEdge.relation || "存在关联"}</div>
              {data.layout === "map" ? (
                <div className="mt-2 space-y-1 border-t border-border/45 pt-2 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5" />
                    {routeStyle.label}{data.graphEdge.distanceHint ? ` · ${data.graphEdge.distanceHint}` : ""}
                  </div>
                  {data.graphEdge.risk ? (
                    <div className="flex items-start gap-1.5">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{data.graphEdge.risk}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {data.detailPinned ? <div className="mt-2 text-[10px] text-muted-foreground">点击画布空白处收起</div> : null}
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
