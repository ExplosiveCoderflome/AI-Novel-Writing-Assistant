import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  applyNodeChanges,
  type EdgeMouseHandler,
  type EdgeTypes,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Minus, Plus, RotateCcw } from "lucide-react";
import FullscreenView from "@/components/common/FullscreenView";
import { Button } from "@/components/ui/button";
import {
  WorldGraphEdge,
  WorldGraphNode,
  type WorldFlowEdge,
  type WorldFlowNode,
} from "./WorldGraphElements";
import {
  GRAPH_NODE_SIZE,
  buildGraphLayout,
  getRiskTone,
  getShortRelation,
  getVisibleEdgeLabelIds,
  type GraphEdge,
  type GraphLayout,
  type GraphNode,
  type Point,
} from "./worldGraphLayout";

interface WorldGraphCanvasProps {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  colorByType?: (type?: string) => string;
  layout?: GraphLayout;
}

const nodeTypes: NodeTypes = { worldNode: WorldGraphNode };
const edgeTypes: EdgeTypes = { worldEdge: WorldGraphEdge };

function centerPositions(nodes: WorldFlowNode[], layout: GraphLayout): Map<string, Point> {
  const size = GRAPH_NODE_SIZE[layout];
  return new Map(nodes.map((node) => [node.id, {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  }]));
}

function edgeHandles(source: Point, target: Point) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

export default function WorldGraphCanvas({
  title,
  nodes,
  edges,
  colorByType,
  layout = "graph",
}: WorldGraphCanvasProps) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<WorldFlowNode, WorldFlowEdge> | null>(null);
  const [interactiveNodes, setInteractiveNodes] = useState<WorldFlowNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const edgeHoverTimerRef = useRef<number | null>(null);
  const canvasWidth = layout === "map" ? 1120 : 1040;
  const canvasHeight = layout === "map" ? 620 : 560;
  const size = GRAPH_NODE_SIZE[layout];

  const edgesWithIds = useMemo(() => edges.map((edge, index) => ({
    ...edge,
    id: `${edge.source}::${edge.target}::${index}`,
  })), [edges]);

  const initialNodes = useMemo<WorldFlowNode[]>(() => {
    const positions = buildGraphLayout(nodes, edges, canvasWidth, canvasHeight, layout);
    return nodes.flatMap((node) => {
      const point = positions.get(node.id);
      if (!point) return [];
      return [{
        id: node.id,
        type: "worldNode" as const,
        position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
        data: {
          graphNode: node,
          layout,
          tone: layout === "map" ? getRiskTone(node.risk) : colorByType?.(node.type) ?? "hsl(var(--primary))",
          active: false,
          dimmed: false,
        },
        draggable: true,
        selectable: true,
        focusable: false,
        style: { width: size.width, height: size.height },
        zIndex: 10,
      }];
    });
  }, [canvasHeight, canvasWidth, colorByType, edges, layout, nodes, size.height, size.width]);

  const fitGraph = useCallback((duration = 240) => {
    window.requestAnimationFrame(() => {
      void flowInstance?.fitView({ padding: 0.18, duration });
    });
  }, [flowInstance]);

  useEffect(() => {
    setInteractiveNodes(initialNodes);
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setSelectedEdgeId(null);
    fitGraph(220);
  }, [fitGraph, initialNodes]);

  const activeEdgeId = hoveredEdgeId ?? selectedEdgeId;
  const positions = useMemo(() => centerPositions(interactiveNodes, layout), [interactiveNodes, layout]);
  const activeEdge = activeEdgeId ? edgesWithIds.find((edge) => edge.id === activeEdgeId) ?? null : null;
  const activeNodeIds = useMemo(() => new Set(activeEdge ? [activeEdge.source, activeEdge.target] : []), [activeEdge]);
  const visibleLabelIds = useMemo(
    () => getVisibleEdgeLabelIds(edgesWithIds, positions, layout),
    [edgesWithIds, layout, positions],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const handleEdgeHoverChange = useCallback((edgeId: string | null) => {
    if (edgeHoverTimerRef.current != null) {
      window.clearTimeout(edgeHoverTimerRef.current);
      edgeHoverTimerRef.current = null;
    }
    if (edgeId) {
      setHoveredEdgeId(edgeId);
      return;
    }
    edgeHoverTimerRef.current = window.setTimeout(() => {
      setHoveredEdgeId(null);
      edgeHoverTimerRef.current = null;
    }, 140);
  }, []);

  useEffect(() => () => {
    if (edgeHoverTimerRef.current != null) {
      window.clearTimeout(edgeHoverTimerRef.current);
    }
  }, []);

  const handleEdgeSelect = useCallback((edgeId: string) => {
    setSelectedEdgeId((current) => current === edgeId ? null : edgeId);
  }, []);

  const displayNodes = useMemo<WorldFlowNode[]>(() => interactiveNodes.map((node) => {
    const active = node.id === hoveredNodeId || activeNodeIds.has(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        active,
        dimmed: Boolean(activeEdgeId) && !activeNodeIds.has(node.id),
      },
      zIndex: active ? 30 : 10,
    };
  }), [activeEdgeId, activeNodeIds, hoveredNodeId, interactiveNodes]);

  const displayEdges = useMemo<WorldFlowEdge[]>(() => edgesWithIds.flatMap((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return [];
    const active = edge.id === activeEdgeId;
    const handles = edgeHandles(source, target);
    return [{
      id: edge.id,
      type: "worldEdge" as const,
      source: edge.source,
      target: edge.target,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      selectable: true,
      focusable: true,
      selected: edge.id === selectedEdgeId,
      ariaLabel: `${nodeById.get(edge.source)?.label ?? edge.source}与${nodeById.get(edge.target)?.label ?? edge.target}：${edge.relation}`,
      data: {
        graphEdge: edge,
        layout,
        sourceLabel: nodeById.get(edge.source)?.label ?? edge.source,
        targetLabel: nodeById.get(edge.target)?.label ?? edge.target,
        shortLabel: getShortRelation(edge),
        labelVisible: visibleLabelIds.has(edge.id),
        active,
        dimmed: Boolean(activeEdgeId) && !active,
        detailOpen: active,
        detailPinned: edge.id === selectedEdgeId,
        onHoverChange: handleEdgeHoverChange,
        onSelect: handleEdgeSelect,
      },
      zIndex: active ? 25 : 5,
    }];
  }), [
    activeEdgeId,
    edgesWithIds,
    handleEdgeHoverChange,
    handleEdgeSelect,
    layout,
    nodeById,
    positions,
    selectedEdgeId,
    visibleLabelIds,
  ]);

  const handleNodesChange = useCallback((changes: NodeChange<WorldFlowNode>[]) => {
    setInteractiveNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleNodeEnter: NodeMouseHandler<WorldFlowNode> = (_, node) => setHoveredNodeId(node.id);
  const handleNodeLeave: NodeMouseHandler<WorldFlowNode> = () => setHoveredNodeId(null);
  const handleEdgeEnter: EdgeMouseHandler<WorldFlowEdge> = (_, edge) => handleEdgeHoverChange(edge.id);
  const handleEdgeLeave: EdgeMouseHandler<WorldFlowEdge> = () => handleEdgeHoverChange(null);
  const handleEdgeClick: EdgeMouseHandler<WorldFlowEdge> = (event, edge) => {
    event.stopPropagation();
    handleEdgeSelect(edge.id);
  };

  const resetGraph = () => {
    setInteractiveNodes(initialNodes);
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setSelectedEdgeId(null);
    fitGraph();
  };

  return (
    <FullscreenView
      title={title}
      description={layout === "map"
        ? "拖动地点整理空间，悬停路线查看距离、风险和完整关系。"
        : "拖动势力整理关系，悬停连线查看双方与完整关系。"}
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
            onClick={() => void flowInstance?.zoomOut({ duration: 160 })}
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
            onClick={() => void flowInstance?.zoomIn({ duration: 160 })}
            aria-label="放大图谱"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={resetGraph} aria-label="重置图谱布局">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
    >
      <div
        className={isFullscreen
          ? "relative min-h-0 flex-1 bg-[radial-gradient(circle_at_45%_42%,hsl(var(--background))_0%,hsl(var(--muted)/0.35)_100%)]"
          : layout === "map"
            ? "relative h-[500px] bg-[radial-gradient(circle_at_45%_42%,hsl(var(--background))_0%,hsl(var(--muted)/0.42)_100%)]"
            : "relative h-[450px] bg-[radial-gradient(circle_at_50%_50%,hsl(var(--background))_0%,hsl(var(--muted)/0.28)_100%)]"}
      >
        <ReactFlow<WorldFlowNode, WorldFlowEdge>
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(instance) => {
            setFlowInstance(instance);
            window.requestAnimationFrame(() => void instance.fitView({ padding: 0.18, duration: 220 }));
          }}
          onNodesChange={handleNodesChange}
          onNodeMouseEnter={handleNodeEnter}
          onNodeMouseLeave={handleNodeLeave}
          onEdgeMouseEnter={handleEdgeEnter}
          onEdgeMouseLeave={handleEdgeLeave}
          onEdgeClick={handleEdgeClick}
          onPaneClick={() => {
            setSelectedEdgeId(null);
            handleEdgeHoverChange(null);
          }}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          nodesDraggable
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable
          elementsSelectable
          panOnDrag
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          minZoom={0.45}
          maxZoom={2}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.18 }}
        >
          <Background
            variant={layout === "map" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={layout === "map" ? 52 : 28}
            size={layout === "map" ? 1 : 1.15}
            color="hsl(var(--border))"
          />
          {layout === "map" ? (
            <Panel position="top-right" className="pointer-events-none m-4 grid h-14 w-14 place-items-center rounded-full border border-border/50 bg-background/75 text-[10px] font-semibold text-muted-foreground shadow-sm backdrop-blur">
              <span className="absolute top-1">北</span>
              <span className="absolute bottom-1">南</span>
              <span className="absolute left-1">西</span>
              <span className="absolute right-1">东</span>
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            </Panel>
          ) : null}
        </ReactFlow>
        {displayNodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">暂无可展示的图谱内容</div>
        ) : null}
      </div>
      <div className="border-t border-border/25 px-5 py-3 text-xs text-muted-foreground">
        拖动画布移动视图，拖动节点整理布局；悬停关系查看详情，点击可固定详情。
      </div>
    </FullscreenView>
  );
}
