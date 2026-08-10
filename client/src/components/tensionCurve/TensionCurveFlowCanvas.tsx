import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useNodesState,
  type Node,
  type NodeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CONTAINER_HEIGHT,
  HEIGHT,
  NULL_TRACK_Y,
  PADDING,
  PLOT_BOTTOM,
  POINT_NODE_HALF,
  TICKS,
  buildBeatBands,
  chartWidth,
  clampScore,
  clampY,
  computeHeightFitZoom,
  createYScale,
  curvePath,
  pathFromValues,
  pointX,
  selectedScopeMatches,
  snapScore,
} from "./curveCoordinates";
import {
  TensionCanvasNodeComponent,
  TensionPointNodeComponent,
} from "./TensionCurveNodes";
import type {
  CurveSegment,
  TensionCanvasData,
  TensionCurveSeries,
  TensionPointData,
} from "./tensionCurveTypes";

interface TensionCurveFlowCanvasProps {
  series: TensionCurveSeries[];
  selectedViewportKey?: string;
  compact?: boolean;
  readonly?: boolean;
  showReferenceCurve?: boolean;
  referenceValues?: number[];
  onPointChange?: (seriesId: string, pointId: string, value: number) => void;
  onPointRelease?: (seriesId: string, pointId: string, value: number) => void;
  onPointSelect?: (seriesId: string, pointId: string) => void;
}

type TensionCanvasNode = Node<TensionCanvasData, "tensionCanvas">;
type TensionPointNode = Node<TensionPointData, "tensionPoint">;
type TensionFlowNode = TensionCanvasNode | TensionPointNode;

interface PointLayout {
  seriesId: string;
  pointId: string;
  x: number;
  y: number;
  value: number | null;
}

const nodeTypes: NodeTypes = {
  tensionCanvas: TensionCanvasNodeComponent,
  tensionPoint: TensionPointNodeComponent,
};

function buildSeriesSegments(
  series: TensionCurveSeries[],
  nodes: TensionFlowNode[],
): CurveSegment[] {
  const yScale = createYScale();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return series.flatMap((item) => {
    const itemSegments: CurveSegment[] = [];
    let current: Array<[number, number]> = [];
    item.points.forEach((point, index) => {
      if (typeof point.value !== "number") {
        if (current.length > 1) {
          itemSegments.push({
            key: `${item.id}-${itemSegments.length}`,
            path: curvePath(current) ?? "",
            color: item.color,
          });
        }
        current = [];
        return;
      }
      const node = nodesById.get(`${item.id}::${point.id}`);
      const y = node ? clampY(node.position.y + POINT_NODE_HALF) : yScale(point.value);
      current.push([pointX(index, item.points.length), y]);
    });
    if (current.length > 1) {
      itemSegments.push({
        key: `${item.id}-${itemSegments.length}`,
        path: curvePath(current) ?? "",
        color: item.color,
      });
    }
    return itemSegments.filter((segment) => segment.path);
  });
}

export function TensionCurveFlowCanvas(props: TensionCurveFlowCanvasProps) {
  const {
    series,
    selectedViewportKey = "all",
    compact = false,
    readonly = false,
    showReferenceCurve = false,
    referenceValues = [],
    onPointChange,
    onPointRelease,
    onPointSelect,
  } = props;
  const [flowNodes, setFlowNodes] = useNodesState<TensionFlowNode>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<TensionFlowNode> | null>(null);

  const primaryPoints = series[0]?.points ?? [];
  const primaryPointCount = primaryPoints.length;
  const canvasWidth = chartWidth(primaryPointCount);
  const editable = !readonly && Boolean(onPointChange);

  const buildCanvasData = useCallback((nodes: TensionFlowNode[]): TensionCanvasData => {
    const yScale = createYScale();
    const segments = buildSeriesSegments(series, nodes);
    if (showReferenceCurve && referenceValues.length > 1) {
      const referencePath = pathFromValues(referenceValues, primaryPointCount, yScale);
      if (referencePath) {
        segments.unshift({
          key: "reference",
          path: referencePath,
          color: "#64748b",
          dash: "8 7",
          opacity: 0.8,
        });
      }
    }
    return {
      width: canvasWidth,
      ticks: TICKS,
      bands: buildBeatBands(primaryPoints, selectedViewportKey),
      guides: primaryPoints.map((point, index) => ({
        key: point.id,
        x: pointX(index, primaryPointCount),
        label: index % 5 === 0 || selectedScopeMatches(point, selectedViewportKey) ? String(point.chapterOrder) : "",
        emphasized: selectedScopeMatches(point, selectedViewportKey),
      })),
      segments,
    };
  }, [canvasWidth, primaryPointCount, primaryPoints, referenceValues, selectedViewportKey, showReferenceCurve, series]);

  const refreshCanvasNode = useCallback((nodes: TensionFlowNode[]): TensionFlowNode[] => {
    const canvasData = buildCanvasData(nodes);
    return nodes.map((node) => {
      if (node.id !== "__tension_canvas") {
        return node;
      }
      return { ...node, data: canvasData } as TensionCanvasNode;
    });
  }, [buildCanvasData]);

  const commitPointValue = useCallback((seriesId: string, pointId: string, value: number) => {
    onPointChange?.(seriesId, pointId, clampScore(value));
  }, [onPointChange]);

  const releasePoint = useCallback((seriesId: string, pointId: string, value: number) => {
    onPointRelease?.(seriesId, pointId, value);
  }, [onPointRelease]);

  const layout = useMemo(() => {
    const yScale = createYScale();
    const pointLayouts = new Map<string, PointLayout>();
    const nodes: TensionFlowNode[] = [{
      id: "__tension_canvas",
      type: "tensionCanvas",
      position: { x: 0, y: 0 },
      data: {
        width: canvasWidth,
        ticks: TICKS,
        bands: buildBeatBands(primaryPoints, selectedViewportKey),
        guides: [],
        segments: [],
      },
      draggable: false,
      selectable: false,
      focusable: false,
      style: {
        width: canvasWidth,
        height: HEIGHT,
        zIndex: 0,
      },
    }];

    series.forEach((item) => {
      item.points.forEach((point, index) => {
        const numericValue = typeof point.value === "number" ? point.value : null;
        const x = pointX(index, item.points.length);
        const y = numericValue != null ? yScale(numericValue) : NULL_TRACK_Y;
        const nodeId = `${item.id}::${point.id}`;
        pointLayouts.set(nodeId, {
          seriesId: item.id,
          pointId: point.id,
          x,
          y,
          value: point.value,
        });
        nodes.push({
          id: nodeId,
          type: "tensionPoint",
          position: { x: x - POINT_NODE_HALF, y: y - POINT_NODE_HALF },
          data: {
            seriesId: item.id,
            pointId: point.id,
            chapterOrder: point.chapterOrder,
            title: point.title,
            value: point.value,
            color: item.color,
            source: point.source,
            editable: editable && item.editable !== false,
            selectedScope: selectedScopeMatches(point, selectedViewportKey),
            onCommitValue: commitPointValue,
            onRelease: releasePoint,
          },
          draggable: editable && item.editable !== false && numericValue != null,
          selectable: true,
          focusable: true,
          zIndex: 10,
        });
      });
    });

    return {
      nodes,
      pointLayouts,
      valueFromY: (y: number, precise = false) => snapScore(yScale.invert(clampY(y)), precise),
    };
  }, [canvasWidth, commitPointValue, editable, primaryPoints, releasePoint, selectedViewportKey, series]);

  const constrainNodes = useCallback((nodes: TensionFlowNode[]) => (
    nodes.map((node) => {
      const pointLayout = layout.pointLayouts.get(node.id);
      if (!pointLayout) {
        return node;
      }
      const targetY = pointLayout.value == null ? NULL_TRACK_Y : clampY(node.position.y + POINT_NODE_HALF);
      return {
        ...node,
        position: {
          x: pointLayout.x - POINT_NODE_HALF,
          y: targetY - POINT_NODE_HALF,
        },
      };
    })
  ), [layout.pointLayouts]);

  const handleNodesChange = useCallback<OnNodesChange<TensionFlowNode>>((changes) => {
    setFlowNodes((currentNodes) => refreshCanvasNode(constrainNodes(applyNodeChanges<TensionFlowNode>(changes, currentNodes))));
  }, [constrainNodes, refreshCanvasNode, setFlowNodes]);

  const handleNodeDragStop = useCallback<OnNodeDrag<TensionFlowNode>>((event, node) => {
    const pointLayout = layout.pointLayouts.get(node.id);
    if (!pointLayout || pointLayout.value == null || !onPointChange) {
      return;
    }
    onPointChange(
      pointLayout.seriesId,
      pointLayout.pointId,
      layout.valueFromY(node.position.y + POINT_NODE_HALF, event.shiftKey),
    );
  }, [layout, onPointChange]);

  const handleNodeClick = useCallback<NodeMouseHandler<TensionFlowNode>>((_, node) => {
    const pointLayout = layout.pointLayouts.get(node.id);
    if (pointLayout) {
      onPointSelect?.(pointLayout.seriesId, pointLayout.pointId);
    }
  }, [layout.pointLayouts, onPointSelect]);

  useEffect(() => {
    setFlowNodes(refreshCanvasNode(layout.nodes));
  }, [layout.nodes, refreshCanvasNode, setFlowNodes]);

  useEffect(() => {
    if (!flowInstance || primaryPointCount === 0) {
      return;
    }
    const zoom = computeHeightFitZoom(compact ? CONTAINER_HEIGHT.compact : CONTAINER_HEIGHT.normal);
    if (selectedViewportKey === "all") {
      window.setTimeout(() => flowInstance.setViewport(
        { x: -(PADDING.left - 24) * zoom, y: -(PADDING.top - 16) * zoom, zoom },
        { duration: 220 },
      ), 0);
      return;
    }
    const selectedIndexes = primaryPoints
      .map((point, index) => (selectedScopeMatches(point, selectedViewportKey) ? index : -1))
      .filter((index) => index >= 0);
    if (selectedIndexes.length === 0) {
      return;
    }
    const start = selectedIndexes[0];
    const end = selectedIndexes[selectedIndexes.length - 1];
    const centerX = (pointX(start, primaryPointCount) + pointX(end, primaryPointCount)) / 2;
    window.setTimeout(() => flowInstance.setCenter(centerX, PLOT_BOTTOM / 2, { zoom, duration: 220 }), 0);
  }, [compact, flowInstance, primaryPointCount, primaryPoints, selectedViewportKey]);

  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-border/70 bg-muted/10"
      style={{ height: compact ? CONTAINER_HEIGHT.compact : CONTAINER_HEIGHT.normal }}
    >
      <ReactFlow<TensionFlowNode>
        nodes={flowNodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onInit={setFlowInstance}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        nodesDraggable={editable}
        nodesConnectable={false}
        nodesFocusable
        edgesFocusable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling={false}
        autoPanOnNodeDrag={false}
        nodeDragThreshold={3}
        nodeExtent={[
          [PADDING.left - POINT_NODE_HALF, PADDING.top - POINT_NODE_HALF],
          [canvasWidth - PADDING.right - POINT_NODE_HALF, NULL_TRACK_Y - POINT_NODE_HALF],
        ]}
        translateExtent={[
          [-120, -60],
          [canvasWidth + 120, HEIGHT + 80],
        ]}
        minZoom={0.5}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        {!compact ? <Controls showInteractive={false} position="bottom-right" /> : null}
        {!compact && primaryPointCount > 12 ? (
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            style={{ width: 150, height: 52 }}
            nodeColor={(node) => {
              if (node.type !== "tensionPoint") return "#e2e8f0";
              const data = node.data as TensionPointData;
              if (data.source === "user") return "#e11d48";
              return typeof data.value === "number" ? "#2563eb" : "#94a3b8";
            }}
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}
