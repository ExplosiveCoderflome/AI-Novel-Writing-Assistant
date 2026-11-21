import { useEffect, useMemo, useRef } from "react";
import {
  BaseEdge, Handle, MarkerType, Panel, Position, ReactFlow, getViewportForBounds,
  useNodesInitialized, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps, type Viewport,
} from "@xyflow/react";
import { ArrowUpRight, Maximize, Minus, Plus } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { ManuscriptFigure } from "../ManuscriptFigure";
import { stages, type FlowStage } from "../flowDefinition";
import { coverHeight, layoutBookMap, sideWidth, stepHeight, stepWidth,
  type BookMapCover, type BookMapLink, type BookMapStation, type Point } from "./bookMapLayout";

type CoverNode = Node<{ cover: BookMapCover; enter: (stage: FlowStage) => void }, "cover">;
type StepNode = Node<{ station: BookMapStation; active: boolean; read: (id: string) => void }, "step">;
type BookNode = CoverNode | StepNode;
type RouteEdge = Edge<{ link: BookMapLink }, "route">;
type Layout = ReturnType<typeof layoutBookMap>;

function Cover({ data: { cover: { stage, order }, enter } }: NodeProps<CoverNode>) {
  return <button type="button" data-stage={stage.id} className="book-map-cover nodrag nopan" onClick={() => enter(stage)}
    aria-label={`单独查看${stage.title}阶段`}>
    <span className="book-cover-number">{String(order + 1).padStart(2, "0")}</span>
    <span className="book-cover-art"><ManuscriptFigure id={stage.coverStep} /></span>
    <strong>{stage.title}</strong><ArrowUpRight size={13} />
  </button>;
}

function Station({ data: { station: { stage, step, side, condition }, active, read } }: NodeProps<StepNode>) {
  return <div className={`book-map-station ${side ? "optional" : ""}`} data-stage={stage.id}>
    <Handle id="top-in" type="target" position={Position.Top} />
    <Handle id="bottom-out" type="source" position={Position.Bottom} />
    <Handle id="left-in" type="target" position={Position.Left} />
    <Handle id="left-out" type="source" position={Position.Left} />
    <Handle id="right-in" type="target" position={Position.Right} />
    <Handle id="right-out" type="source" position={Position.Right} />
    <button type="button" className="nodrag nopan" data-step={step.id} aria-pressed={active} onClick={() => read(step.id)}>
      <i aria-hidden="true" /><span><strong>{step.title}</strong><small>{condition ?? step.artifact}</small></span>
    </button>
  </div>;
}

function roundedRoute(points: Point[]) {
  const unique = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let path = `M ${unique[0].x} ${unique[0].y}`;
  for (let i = 1; i < unique.length - 1; i++) {
    const prev = unique[i - 1], turn = unique[i], next = unique[i + 1];
    const before = Math.hypot(turn.x - prev.x, turn.y - prev.y), after = Math.hypot(next.x - turn.x, next.y - turn.y);
    const radius = Math.min(7, before / 2, after / 2);
    path += ` L ${turn.x + (prev.x - turn.x) * radius / before} ${turn.y + (prev.y - turn.y) * radius / before}`;
    path += ` Q ${turn.x} ${turn.y} ${turn.x + (next.x - turn.x) * radius / after} ${turn.y + (next.y - turn.y) * radius / after}`;
  }
  const end = unique[unique.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

function Route({ id, sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps<RouteEdge>) {
  if (!data) return null;
  const { link } = data;
  return <BaseEdge id={id} path={roundedRoute([{ x: sourceX, y: sourceY }, ...link.bends, { x: targetX, y: targetY }])}
    markerEnd={markerEnd} label={link.label} labelX={link.labelAt?.x} labelY={link.labelAt?.y}
    labelStyle={{ fill: "var(--atlas-proof)", fontSize: 12 }} labelBgStyle={{ fill: "var(--atlas-stock)" }}
    labelBgPadding={[7, 3]} interactionWidth={0} />;
}

const nodeTypes = { cover: Cover, step: Station };
const edgeTypes = { route: Route };
function MapNavigation({ layout, selected }: { layout: Layout; selected: string | null }) {
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const ready = useNodesInitialized();
  const { getViewport, setViewport, setCenter, zoomIn, zoomOut, fitBounds, viewportInitialized } = useReactFlow();
  const previous = useRef<{ layout: Layout; selected: string | null } | null>(null);
  const beforeReading = useRef<Viewport | null>(null);
  useEffect(() => {
    if (!ready || !viewportInitialized || width <= 1 || height <= 1) return;
    const prior = previous.current;
    previous.current = { layout, selected };
    let view = getViewport();
    if (!prior || prior.layout !== layout) {
      beforeReading.current = null;
      const fit = getViewportForBounds(layout.bounds, width, height, 0.16, 1.18, 0.08);
      const zoom = Math.max(0.7, fit.zoom);
      view = zoom === fit.zoom ? fit : {
        x: Math.max(16, (width - layout.bounds.width * zoom) / 2 - layout.bounds.x * zoom),
        y: Math.max(16, (height - layout.bounds.height * zoom) / 2 - layout.bounds.y * zoom),
        zoom,
      };
      void setViewport(view);
    } else if (!selected && prior.selected && beforeReading.current) {
      void setViewport(beforeReading.current);
      beforeReading.current = null;
    }
    if (selected) {
      if (!prior?.selected || prior.layout !== layout) beforeReading.current = view;
      const station = layout.stations.find(s => s.step.id === selected);
      if (!station) return;
      const w = station.side ? sideWidth : stepWidth;
      const x = station.x * view.zoom + view.x, y = station.y * view.zoom + view.y;
      if (x < 6 || x + w * view.zoom > width - 6 || y < 6 || y + stepHeight * view.zoom > height - 38) {
        void setCenter(station.x + w / 2, station.y + stepHeight / 2, { zoom: view.zoom });
      }
    }
  }, [layout, selected, width, height, ready, viewportInitialized, getViewport, setViewport, setCenter]);
  return <Panel position="bottom-right" className="book-zoom">
    <button type="button" aria-label="缩小全书流程图" title="缩小" onClick={() => void zoomOut()}><Minus size={15} /></button>
    <button type="button" aria-label="放大全书流程图" title="放大" onClick={() => void zoomIn()}><Plus size={15} /></button>
    <button type="button" onClick={() => void fitBounds(layout.bounds, { padding: 0.08 })}><Maximize size={14} />全图</button>
  </Panel>;
}

export function BookMapCanvas({ expanded, selected, enter, read }: {
  expanded: boolean; selected: string | null; enter: (stage: FlowStage) => void; read: (id: string) => void;
}) {
  const layout = useMemo(() => layoutBookMap(stages, expanded), [expanded]);
  const nodes = useMemo<BookNode[]>(() => [
    ...layout.covers.map((cover): CoverNode => ({ id: `stage-${cover.stage.id}`, type: "cover", data: { cover, enter },
      position: { x: cover.x, y: 0 }, width: cover.width, height: coverHeight, focusable: false })),
    ...layout.stations.map((station): StepNode => ({ id: station.step.id, type: "step", data: { station, active: station.step.id === selected, read },
      position: { x: station.x, y: station.y }, width: station.side ? sideWidth : stepWidth, height: stepHeight, focusable: false })),
  ], [layout, selected, read, enter]);
  const edges = useMemo<RouteEdge[]>(() => {
    const titles = new Map(layout.stations.map(({ step }) => [step.id, step.title]));
    return layout.links.map(link => ({
      id: `${link.source}-${link.target}`, source: link.source, target: link.target,
      sourceHandle: link.sourceHandle, targetHandle: link.targetHandle, data: { link }, type: "route",
      ariaLabel: `${titles.get(link.source)} → ${titles.get(link.target)}`,
      className: `book-link book-link-${link.kind}${link.source === selected || link.target === selected ? " is-current" : ""}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10,
        color: link.kind === "return" ? "var(--atlas-proof)" : "var(--atlas-ink)" },
    }));
  }, [layout, selected]);
  return <div className="flow-canvas book-map-canvas" role="region" aria-label="从开书到整本正文的连续流程图">
    <ReactFlow<BookNode, RouteEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      minZoom={0.16} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false}
      zoomOnDoubleClick={false} zoomOnScroll={false} panOnScroll preventScrolling proOptions={{ hideAttribution: true }}>
      <MapNavigation layout={layout} selected={selected} />
    </ReactFlow>
  </div>;
}
