import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Background,
  BaseEdge,
  ControlButton,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  getBezierPath,
  getSmoothStepPath,
  useStoreApi,
  type Edge,
  type EdgeMouseHandler,
  type NodeChange,
  type EdgeProps,
  type NodeOrigin,
  type NodeMouseHandler,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, GitBranch, ListRestart, Network, RadioTower, Sparkles, UsersRound } from "lucide-react";
import type { CharacterRelation } from "@ai-novel/shared/types/novel";
import type { CharacterRelationStage } from "@ai-novel/shared/types/characterDynamics";
import FullscreenView from "@/components/common/FullscreenView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCastRoleLabel, isProtagonistCharacter } from "../characterAssetWorkspace.helpers";
import type {
  RelationshipGraphEdge,
  RelationshipGraphCharacter,
  RelationshipGraphMode,
  RelationshipGraphModel,
  RelationshipGraphNode,
} from "./characterRelationshipGraphModel";
import { CARD_WIDTH, CARD_HEIGHT } from "./relationshipGraph/orderedLayout";
import { isSettledMove, syncCanvasNodes, type RelationshipFlowNode } from "./relationshipGraph/canvasNodes";
import { useRelationshipLayout } from "./relationshipGraph/useRelationshipLayout";
import { gutterPath, relationshipRoute, type EdgeRoute } from "./relationshipGraph/edgeRouting";

interface CharacterRelationshipGraphPanelProps {
  novelId: string | null;
  model: RelationshipGraphModel;
  mode: RelationshipGraphMode;
  onModeChange: (mode: RelationshipGraphMode) => void;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  isLoading?: boolean;
}

interface RelationshipEdgeData extends Record<string, unknown> {
  graphEdge: RelationshipGraphEdge;
  route: EdgeRoute;
  highlighted: boolean;
}

type RelationshipFlowEdge = Edge<RelationshipEdgeData, "relationshipEdge">;
type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string };

const nodeTypes = {
  characterNode: CharacterRelationshipNode,
};

const edgeTypes = {
  relationshipEdge: CharacterRelationshipEdge,
};

const nodeOrigin: NodeOrigin = [0.5, 0.5];
const fitViewOptions = { padding: 0.18 };

function CanvasNodeSync({ projected }: { projected: RelationshipFlowNode[] }) {
  const store = useStoreApi<RelationshipFlowNode, RelationshipFlowEdge>();
  useLayoutEffect(() => {
    const { nodes, setNodes } = store.getState();
    const next = syncCanvasNodes(nodes, projected);
    if (next !== nodes) setNodes(next);
  }, [projected, store]);
  return null;
}

const MODE_OPTIONS: Array<{
  value: RelationshipGraphMode;
  label: string;
  icon: typeof Network;
}> = [
  { value: "all", label: "全部关系", icon: Network },
  { value: "current", label: "当前角色", icon: RadioTower },
  { value: "tension", label: "高张力", icon: AlertTriangle },
  { value: "dynamic", label: "动态阶段", icon: GitBranch },
];

export default function CharacterRelationshipGraphPanel(props: CharacterRelationshipGraphPanelProps) {
  const { novelId, model, mode, onModeChange, selectedCharacterId, onSelectedCharacterChange, isLoading = false } = props;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const scope = mode === "current" ? `current:${selectedCharacterId}` : mode;
  const { positions, move, reset } = useRelationshipLayout(novelId, scope);
  const previousCharacter = useRef(selectedCharacterId);
  const canvas = useRef<ReactFlowInstance<RelationshipFlowNode, RelationshipFlowEdge> | null>(null);

  useEffect(() => {
    const changedCharacter = previousCharacter.current !== selectedCharacterId;
    previousCharacter.current = selectedCharacterId;
    setSelection(current => {
      if (!changedCharacter && current && (current.type === "node" ? model.nodes : model.edges).some(item => item.id === current.id)) return current;
      if (model.nodes.some(node => node.id === selectedCharacterId)) return { type: "node", id: selectedCharacterId };
      if (model.edges[0]) return { type: "edge", id: model.edges[0].id };
      return model.nodes[0] ? { type: "node", id: model.nodes[0].id } : null;
    });
  }, [model.edges, model.nodes, selectedCharacterId]);

  const restingPositions = useMemo(() => new Map(model.nodes.map(item => [
    item.id, positions.get(item.id) ?? { x: item.x, y: item.y },
  ])), [model.nodes, positions]);

  const flowNodes = useMemo<RelationshipFlowNode[]>(
    () => model.nodes.map((item) => ({
      id: item.id,
      type: "characterNode",
      position: restingPositions.get(item.id)!,
      data: { graphNode: item },
      draggable: true,
      selectable: true,
      selected: selection?.type === "node" && selection.id === item.id,
      focusable: true,
      zIndex: item.isSelected ? 20 : 10,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    })),
    [model.nodes, restingPositions, selection],
  );

  useEffect(() => {
    setHoveredEdge(null);
  }, [novelId, scope]);

  const activeEdgeId = hoveredEdge ?? (selection?.type === "edge" ? selection.id : null);
  const flowEdges = useMemo<RelationshipFlowEdge[]>(() => {
    return model.edges.map(item => {
      const route = relationshipRoute(restingPositions.get(item.source)!, restingPositions.get(item.target)!, mode === "current" && Boolean(selectedCharacterId));
      const highlighted = item.id === activeEdgeId;
      return {
        id: item.id,
        type: "relationshipEdge",
        source: item.source,
        target: item.target,
        sourceHandle: `source-${route.source}`,
        targetHandle: `target-${route.target}`,
        ariaLabel: `${item.sourceName} → ${item.targetName}：${item.label}`,
        data: { graphEdge: item, route, highlighted },
        animated: item.isDynamic,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getEdgeTone(item).stroke,
          width: 18,
          height: 18,
        },
        selectable: true,
        focusable: true,
        zIndex: highlighted ? 2 : 1,
      };
    });
  }, [model.edges, restingPositions, activeEdgeId, mode, selectedCharacterId]);

  const selectedNode = selection?.type === "node"
    ? model.nodes.find((node) => node.id === selection.id) ?? null
    : null;
  const selectedEdge = selection?.type === "edge"
    ? model.edges.find((edge) => edge.id === selection.id) ?? null
    : null;

  const handleNodeClick: NodeMouseHandler<RelationshipFlowNode> = (_, node) => {
    setSelection({ type: "node", id: node.id });
    onSelectedCharacterChange(node.id);
  };

  const handleNodesChange = useCallback((changes: NodeChange<RelationshipFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === "select" && change.selected) {
        setSelection({ type: "node", id: change.id });
      }
    }
    const moves = changes.filter(isSettledMove);
    if (moves.length) move(moves);
  }, [move]);

  const handleEdgeClick: EdgeMouseHandler<RelationshipFlowEdge> = (_, edge) => {
    setSelection({ type: "edge", id: edge.id });
  };

  return (
    <FullscreenView
      title="角色关系网"
      description={positions.size
        ? "点击连线查看关系详情。点「恢复自动排列」可重排当前视图。"
        : mode === "current" && selectedCharacterId ? "查看当前角色与其他人的直接关系。" : "按角色定位分排，同组按姓名排序。点击连线查看关系详情。"}
      meta={(
        <>
          <Badge variant="outline">{model.nodes.length} 个角色</Badge>
          <Badge variant="outline">{model.totalEdgeCount} 条关系</Badge>
          {model.dynamicEdgeCount > 0 ? <Badge variant="secondary">{model.dynamicEdgeCount} 条动态阶段</Badge> : null}
        </>
      )}
      actions={MODE_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={mode === option.value ? "default" : "outline"}
            onClick={() => onModeChange(option.value)}
            className="gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
      toggleLabel="全屏查看"
      exitLabel="退出全屏"
      className="border-0 shadow-none"
      columns={{ layoutId: "character-graph", gap: 0, right: { label: "调整人物关系详情宽度", initial: "var(--graph-details-width, 340px)", min: 188 } }}
      bodyClassName="grid min-h-[560px] gap-0 xl:workspace-split"
      fullscreenBodyClassName="h-full min-h-0 workspace-split [--graph-details-width:360px]"
    >
      <div className="h-full min-h-[520px] min-w-0 border-b border-border/60 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.08),transparent_28%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.24)_100%)] xl:border-b-0 xl:border-r">
          {isLoading ? (
            <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-muted-foreground">
              正在读取角色关系网...
            </div>
          ) : flowNodes.length > 0 ? (
            <ReactFlow<RelationshipFlowNode, RelationshipFlowEdge>
              key={JSON.stringify([novelId, scope])}
              defaultNodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              onNodesChange={handleNodesChange}
              onPaneClick={() => setSelection(null)}
              onKeyDown={event => { if (event.key === "Escape") setSelection(null); }}
              onEdgeClick={handleEdgeClick}
              onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
              onEdgeMouseLeave={() => setHoveredEdge(null)}
              onEdgesChange={changes => {
                for (const change of changes) {
                  if (change.type === "select" && change.selected) setSelection({ type: "edge", id: change.id });
                }
              }}
              onInit={instance => { canvas.current = instance; }}
              elevateEdgesOnSelect={false}
              nodesDraggable
              selectNodesOnDrag={false}
              autoPanOnNodeDrag={false}
              nodeDragThreshold={3}
              nodeClickDistance={3}
              deleteKeyCode={null}
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={fitViewOptions}
              nodeOrigin={nodeOrigin}
              minZoom={0.35}
              maxZoom={1.25}
              panOnDrag
              panOnScroll
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              proOptions={{ hideAttribution: true }}
            >
              <CanvasNodeSync projected={flowNodes} />
              <Background color="hsl(var(--border))" gap={28} size={1} />
              <Panel position="top-left" className="rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-slate-500" />普通关系</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-orange-500" />高张力</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-sky-600" />动态阶段</span>
                </div>
              </Panel>
              {mode === "current" && selectedCharacterId && !positions.size ? (
                <Panel position="bottom-left" className="rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                  当前角色在左侧，直接关系向右展开；点击连线查看关系细节。
                </Panel>
              ) : null}
              <Controls showInteractive={false} position="bottom-right">
                <ControlButton title="恢复自动排列" aria-label="恢复自动排列" disabled={!positions.size}
                  onClick={() => {
                    reset();
                    requestAnimationFrame(() => { void canvas.current?.fitView(fitViewOptions); });
                  }}>
                  <ListRestart aria-hidden="true" />
                </ControlButton>
              </Controls>
            </ReactFlow>
          ) : (
            <EmptyGraphState />
          )}
      </div>
      <RelationshipDetailPanel
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        selectedCharacterId={selectedCharacterId}
      />
    </FullscreenView>
  );
}

function CharacterRelationshipNode(props: NodeProps<RelationshipFlowNode>) {
  const { graphNode } = props.data;
  const character = graphNode.character;
  const isProtagonist = isProtagonistCharacter(character);
  const tone = getNodeTone(character);
  const shortName = character.name.trim().slice(0, 2) || "角";

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-2xl border px-3.5 pb-9 pt-3.5 shadow-sm transition",
        isProtagonist
          ? "border-emerald-300 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_58%,#ecfeff_100%)] shadow-[0_18px_42px_rgba(16,185,129,0.18)]"
          : "bg-background/95",
        graphNode.isSelected
          ? isProtagonist
            ? "ring-2 ring-emerald-300/70"
            : "border-primary shadow-md ring-2 ring-primary/15"
          : !isProtagonist && "border-border/70",
      )}
    >
      {isProtagonist ? (
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#10b981,#0ea5e9)]" />
      ) : null}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map(position =>
        (["target", "source"] as const).map(type =>
          <Handle key={`${type}-${position}`} id={`${type}-${position}`} type={type} position={position}
            isConnectable={false} className="!h-2 !w-2 !border-0 !bg-transparent" />
        )
      )}
      <div className="flex items-start gap-2">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold",
          tone.avatar,
        )}>
          {shortName}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-semibold", isProtagonist && "text-emerald-950")}>{character.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{character.role || getCastRoleLabel(character.castRole)}</div>
        </div>
        {isProtagonist ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
            <Sparkles className="h-2.5 w-2.5" />
            核心
          </span>
        ) : null}
      </div>
      <div className="mt-3 line-clamp-2 min-h-[36px] text-xs leading-[18px] text-muted-foreground">
        {character.currentGoal || character.storyFunction || character.relationToProtagonist || "待补全角色目标"}
      </div>
      <div className="absolute inset-x-3.5 bottom-2.5 flex flex-wrap gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone.badge)}>
          {isProtagonist ? "主角核心" : getCastRoleLabel(character.castRole)}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {graphNode.relationCount} 关系
        </span>
        {graphNode.dynamicCount > 0 ? (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
            {graphNode.dynamicCount} 动态
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CharacterRelationshipEdge(props: EdgeProps) {
  const data = props.data as RelationshipEdgeData | undefined;
  const graphEdge = data?.graphEdge;
  const route = data?.route;
  const [edgePath, labelX, labelY] = route?.path === "gutter"
    ? gutterPath({x: props.sourceX, y: props.sourceY}, {x: props.targetX, y: props.targetY}, route)
    : route?.path === "step" ? getSmoothStepPath({ ...props, offset: 30 }) : getBezierPath(props);
  const tone = getEdgeTone(graphEdge);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={props.markerEnd}
        style={{
          stroke: tone.stroke,
          strokeWidth: data?.highlighted ? 3 : 1.8,
          strokeDasharray: graphEdge?.isDynamic ? "7 5" : undefined,
          opacity: data?.highlighted ? 1 : 0.72,
        }}
      />
      {graphEdge && data?.highlighted ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan absolute max-w-[150px] truncate rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm",
              tone.label,
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            {graphEdge.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function RelationshipDetailPanel(props: {
  selectedNode: RelationshipGraphNode | null;
  selectedEdge: RelationshipGraphEdge | null;
  selectedCharacterId: string;
}) {
  const { selectedNode, selectedEdge } = props;

  return (
    <aside className="h-full min-h-0 overflow-y-auto bg-background p-4">
      {selectedEdge ? (
        <EdgeDetail edge={selectedEdge} />
      ) : selectedNode ? (
        <NodeDetail node={selectedNode} />
      ) : (
        <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          点击角色或关系线查看详情。
        </div>
      )}
    </aside>
  );
}

function NodeDetail(props: { node: RelationshipGraphNode }) {
  const { character } = props.node;
  const isProtagonist = isProtagonistCharacter(character);

  return (
    <div className="space-y-4">
      <div className={cn(
        "rounded-2xl border border-border/70 bg-muted/10 p-4",
        isProtagonist && "border-emerald-200 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_70%)]",
      )}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-base font-semibold">{character.name}</div>
          <Badge variant="secondary">{getCastRoleLabel(character.castRole)}</Badge>
          {isProtagonist ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">叙事核心</Badge> : null}
        </div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">{character.role || "未定义身份"}</div>
      </div>
      <DetailBlock title="当前目标" value={character.currentGoal} />
      <DetailBlock title="当前状态" value={character.currentState} />
      <DetailBlock title="故事作用" value={character.storyFunction} />
      <DetailBlock title="与主角关系" value={character.relationToProtagonist} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <MiniStat icon={<UsersRound className="h-3.5 w-3.5" />} label="关系数" value={String(props.node.relationCount)} />
        <MiniStat icon={<GitBranch className="h-3.5 w-3.5" />} label="动态阶段" value={String(props.node.dynamicCount)} />
      </div>
    </div>
  );
}

function EdgeDetail(props: { edge: RelationshipGraphEdge }) {
  const { edge } = props;
  const relation = edge.staticRelation;
  const currentStage = edge.dynamicStages.find((stage) => stage.isCurrent) ?? edge.dynamicStages[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-base font-semibold">{edge.label}</div>
          {edge.isDynamic ? <Badge variant="secondary">动态阶段</Badge> : null}
          {edge.isHighTension ? <Badge variant="outline">高张力</Badge> : null}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {getRelationNames(edge)}
        </div>
      </div>
      <DetailBlock title="表层关系" value={relation?.surfaceRelation} />
      <DetailBlock title="当前阶段" value={currentStage?.stageSummary ?? currentStage?.stageLabel} />
      <DetailBlock title="隐藏张力" value={relation?.hiddenTension} />
      <DetailBlock title="冲突来源" value={relation?.conflictSource} />
      <DetailBlock title="秘密不对称" value={relation?.secretAsymmetry} />
      <DetailBlock title="下一转折点" value={currentStage?.nextTurnPoint ?? relation?.nextTurnPoint} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <MiniStat icon={<Sparkles className="h-3.5 w-3.5" />} label="阶段数" value={String(edge.dynamicStages.length)} />
        <MiniStat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="风险" value={edge.isHighTension ? "高" : "普通"} />
      </div>
      {currentStage?.chapterOrder ? (
        <div className="rounded-xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
          最近推进：第 {currentStage.chapterOrder} 章
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock(props: { title: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{props.title}</div>
      <div className="mt-2 text-sm leading-6">{props.value || "待补全"}</div>
    </div>
  );
}

function MiniStat(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

function EmptyGraphState() {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-dashed bg-background/85 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Network className="h-5 w-5" />
        </div>
        <div className="mt-4 text-sm font-medium">关系网还没有可绘制内容</div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          先应用一套角色阵容，或完成几章后同步角色动态；系统会把表层关系、隐藏张力和动态阶段汇总到这里。
        </div>
      </div>
    </div>
  );
}

function getNodeTone(character: RelationshipGraphCharacter) {
  if (isProtagonistCharacter(character)) {
    return {
      avatar: "border-emerald-200 bg-emerald-50 text-emerald-800",
      badge: "bg-emerald-50 text-emerald-700",
    };
  }
  if (character.castRole === "antagonist" || character.castRole === "pressure_source") {
    return {
      avatar: "border-orange-200 bg-orange-50 text-orange-800",
      badge: "bg-orange-50 text-orange-700",
    };
  }
  if (character.castRole === "ally" || character.castRole === "mentor") {
    return {
      avatar: "border-sky-200 bg-sky-50 text-sky-800",
      badge: "bg-sky-50 text-sky-700",
    };
  }
  if (character.castRole === "love_interest") {
    return {
      avatar: "border-rose-200 bg-rose-50 text-rose-800",
      badge: "bg-rose-50 text-rose-700",
    };
  }
  return {
    avatar: "border-slate-200 bg-slate-50 text-slate-800",
    badge: "bg-slate-100 text-slate-700",
  };
}

function getEdgeTone(edge?: RelationshipGraphEdge) {
  if (edge?.isHighTension) {
    return { stroke: "#f97316", label: "border-orange-200 bg-orange-50 text-orange-800" };
  }
  if (edge?.isDynamic) {
    return { stroke: "#0284c7", label: "border-sky-200 bg-sky-50 text-sky-800" };
  }
  return { stroke: "#64748b", label: "border-slate-200 bg-white text-slate-700" };
}

function getRelationNames(edge: RelationshipGraphEdge): string {
  if (edge.sourceName || edge.targetName) {
    return `${edge.sourceName || "未知角色"} -> ${edge.targetName || "未知角色"}`;
  }
  const staticRelation = edge.staticRelation;
  if (staticRelation?.sourceCharacterName || staticRelation?.targetCharacterName) {
    return `${staticRelation.sourceCharacterName ?? "未知角色"} -> ${staticRelation.targetCharacterName ?? "未知角色"}`;
  }
  const stage = edge.dynamicStages[0];
  if (stage) {
    return `${stage.sourceCharacterName ?? "未知角色"} -> ${stage.targetCharacterName ?? "未知角色"}`;
  }
  return "角色关系";
}
