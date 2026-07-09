import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  applyNodeChanges,
  getBezierPath,
  type Edge,
  type EdgeMouseHandler,
  type NodeChange,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, GitBranch, Network, RadioTower, Sparkles, UsersRound } from "lucide-react";
import type { Character, CharacterRelation } from "@ai-novel/shared/types/novel";
import type { CharacterRelationStage } from "@ai-novel/shared/types/characterDynamics";
import FullscreenView from "@/components/common/FullscreenView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCastRoleLabel, isProtagonistCharacter } from "../characterAssetWorkspace.helpers";
import type {
  RelationshipGraphEdge,
  RelationshipGraphMode,
  RelationshipGraphModel,
  RelationshipGraphNode,
} from "./characterRelationshipGraphModel";

interface CharacterRelationshipGraphPanelProps {
  model: RelationshipGraphModel;
  mode: RelationshipGraphMode;
  onModeChange: (mode: RelationshipGraphMode) => void;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  isLoading?: boolean;
}

interface RelationshipNodeData extends Record<string, unknown> {
  graphNode: RelationshipGraphNode;
}

interface RelationshipEdgeData extends Record<string, unknown> {
  graphEdge: RelationshipGraphEdge;
}

type RelationshipFlowNode = Node<RelationshipNodeData, "characterNode">;
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

const GRAPH_NODE_WIDTH = 164;
const GRAPH_NODE_HEIGHT = 128;

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
  const { model, mode, onModeChange, selectedCharacterId, onSelectedCharacterChange, isLoading = false } = props;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [interactiveNodes, setInteractiveNodes] = useState<RelationshipFlowNode[]>([]);
  const previousModeRef = useRef<RelationshipGraphMode>(mode);

  useEffect(() => {
    if (selectedCharacterId && model.nodes.some((node) => node.id === selectedCharacterId)) {
      setSelection({ type: "node", id: selectedCharacterId });
      return;
    }
    if (model.edges[0]) {
      setSelection({ type: "edge", id: model.edges[0].id });
      return;
    }
    if (model.nodes[0]) {
      setSelection({ type: "node", id: model.nodes[0].id });
      return;
    }
    setSelection(null);
  }, [model.edges, model.nodes, selectedCharacterId]);

  const flowNodes = useMemo<RelationshipFlowNode[]>(
    () => model.nodes.map((item) => ({
      id: item.id,
      type: "characterNode",
      position: { x: item.x, y: item.y },
      data: { graphNode: item },
      draggable: true,
      selectable: true,
      focusable: true,
      zIndex: item.isSelected ? 20 : 10,
      style: {
        width: GRAPH_NODE_WIDTH,
        height: GRAPH_NODE_HEIGHT,
      },
    })),
    [model.nodes],
  );

  useEffect(() => {
    setInteractiveNodes((currentNodes) => {
      const shouldResetLayout = previousModeRef.current !== mode || currentNodes.length === 0;
      previousModeRef.current = mode;
      if (shouldResetLayout) {
        return flowNodes;
      }
      const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
      return flowNodes.map((node) => {
        const currentNode = currentNodeById.get(node.id);
        return currentNode
          ? { ...node, position: currentNode.position }
          : node;
      });
    });
  }, [flowNodes, mode]);

  const flowEdges = useMemo<RelationshipFlowEdge[]>(
    () => model.edges.map((item) => ({
      id: item.id,
      type: "relationshipEdge",
      source: item.source,
      target: item.target,
      data: { graphEdge: item },
      animated: item.isDynamic,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeTone(item).stroke,
        width: 18,
        height: 18,
      },
      selectable: true,
      focusable: true,
      zIndex: item.isDynamic ? 16 : 12,
    })),
    [model.edges],
  );

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
    setInteractiveNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);

  const handleEdgeClick: EdgeMouseHandler<RelationshipFlowEdge> = (_, edge) => {
    setSelection({ type: "edge", id: edge.id });
  };

  return (
    <FullscreenView
      title="角色关系网"
      description="以图谱方式观察角色之间的压力、合作、秘密和下一转折点。"
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
      bodyClassName="grid min-h-[560px] gap-0 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
        <div className="min-h-[520px] border-b border-border/60 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.08),transparent_28%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.24)_100%)] xl:border-b-0 xl:border-r">
          {isLoading ? (
            <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-muted-foreground">
              正在读取角色关系网...
            </div>
          ) : flowNodes.length > 0 ? (
            <ReactFlow<RelationshipFlowNode, RelationshipFlowEdge>
              nodes={interactiveNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              onNodesChange={handleNodesChange}
              onEdgeClick={handleEdgeClick}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.28, duration: 240 }}
              nodeOrigin={[0.5, 0.5]}
              minZoom={0.35}
              maxZoom={1.25}
              panOnDrag
              panOnScroll
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="hsl(var(--border))" gap={28} size={1} />
              <Panel position="top-left" className="rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-slate-500" />普通关系</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-orange-500" />高张力</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 border-t-2 border-dashed border-sky-600" />动态阶段</span>
                </div>
              </Panel>
              {mode === "current" ? (
                <Panel position="bottom-left" className="rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                  当前角色在左侧，直接关系向右展开；点击连线查看关系细节。
                </Panel>
              ) : null}
              <Controls showInteractive={false} position="bottom-right" />
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

function CharacterRelationshipNode(props: NodeProps) {
  const data = props.data as RelationshipNodeData;
  const { graphNode } = data;
  const character = graphNode.character;
  const isProtagonist = isProtagonistCharacter(character);
  const tone = getNodeTone(character);
  const shortName = character.name.trim().slice(0, 2) || "角";

  return (
    <div
      className={cn(
        "h-[128px] w-[164px] rounded-2xl border bg-background/95 p-3 shadow-sm transition",
        graphNode.isSelected ? "border-primary shadow-md ring-2 ring-primary/15" : "border-border/70",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <div className="flex items-start gap-2">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold", tone.avatar)}>
          {shortName}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{character.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{character.role || getCastRoleLabel(character.castRole)}</div>
        </div>
      </div>
      <div className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-4 text-muted-foreground">
        {character.currentGoal || character.storyFunction || character.relationToProtagonist || "待补全角色目标"}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone.badge)}>
          {isProtagonist ? "主角" : getCastRoleLabel(character.castRole)}
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
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const tone = getEdgeTone(graphEdge);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={props.markerEnd}
        style={{
          stroke: tone.stroke,
          strokeWidth: graphEdge?.isDynamic ? 3.2 : 2.6,
          strokeDasharray: graphEdge?.isDynamic ? "7 5" : undefined,
          opacity: graphEdge?.isHighTension ? 0.96 : 0.84,
        }}
      />
      {graphEdge ? (
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
    <aside className="bg-background p-4">
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-base font-semibold">{character.name}</div>
          <Badge variant="secondary">{getCastRoleLabel(character.castRole)}</Badge>
          {isProtagonistCharacter(character) ? <Badge variant="outline">主角</Badge> : null}
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

function getNodeTone(character: Character) {
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
