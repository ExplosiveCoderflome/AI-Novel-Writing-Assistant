import { useMemo, useState, type CSSProperties } from "react";
import { Background, BackgroundVariant, BaseEdge, Handle, MarkerType, Position, ReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { ArrowUpRight, BookCheck, CornerDownLeft, Feather, Hand, Layers2, LibraryBig } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { FlowStage } from "../flowDefinition";
import { relationsFor, type RelationKind } from "../atlas/stepPromptRelations";
import { MapReferences, type ReferenceNode } from "./MapReferences";
import { BookMapCamera } from "./BookMapCamera";
import { StageImprint } from "./StageImprint";
import { coverHeight, layoutBookMap, sideWidth, spineX, stepHeight, stepWidth,
  type BookMapCover, type BookMapLink, type BookMapStation, type Point } from "./bookMapLayout";

type CoverNode = Node<{ cover: BookMapCover; enter: (stage: FlowStage) => void; locateScope: (scope: string) => void; lit: boolean }, "cover">;
type StepNode = Node<{
  station: BookMapStation; active: boolean; traced: boolean; neighbor: boolean; ports: string; related?: RelationKind;
  read: (id: string) => void; preview: (id: string | null) => void;
}, "step">;
type BookNode = CoverNode | StepNode | ReferenceNode;
type RouteEdge = Edge<{ link: BookMapLink; stage: string; trace: string | null }, "route">;
type ReferenceEdge = Edge<ReturnType<typeof layoutBookMap>["promptLinks"][number], "reference">;

function Cover({ data: { cover: { stage, order }, enter, locateScope, lit } }: NodeProps<CoverNode>) {
  return <div className="atlas-cover-stack" data-stage={stage.id}>
    <button type="button" data-stage={stage.id} className={`book-map-cover nodrag nopan ${lit ? "lit" : ""}`} onClick={() => enter(stage)}
      aria-label={`单独查看${stage.title}阶段`}>
      <StageImprint stage={stage.id} />
      <span className="book-cover-number">{String(order + 1).padStart(2, "0")}</span>
      <span className="book-cover-title"><strong>{stage.title}</strong><ArrowUpRight size={14} /></span>
    </button>
    <button type="button" className="atlas-cover-related nodrag nopan" onClick={() => locateScope(stage.id)}
      aria-label={`查看${stage.title}的阶段提示词`}><LibraryBig size={13} />阶段提示词<ArrowUpRight size={13} /></button>
  </div>;
}

const marks = { author: Hand, ai: Feather, system: Layers2, destination: CornerDownLeft };
function Station({ data: { station: { stage, step, side, condition }, active, traced, neighbor, related, ports, read, preview } }: NodeProps<StepNode>) {
  const finish = step.id === "finish";
  const Mark = finish ? BookCheck : marks[step.kind];
  const compact = useStore(s => s.transform[2] < 0.76);
  return <div className={`book-map-station ${side ? "optional" : ""} ${traced ? "traced" : ""} ${neighbor ? "neighbor" : ""} ${finish ? "terminus" : ""}`}
    data-stage={stage.id} data-compact={compact} data-ports={ports} data-relation={related}>
    <Handle id="top-in" type="target" position={Position.Top} />
    <Handle id="bottom-out" type="source" position={Position.Bottom} />
    <Handle id="left-in" type="target" position={Position.Left} />
    <Handle id="left-out" type="source" position={Position.Left} />
    <Handle id="right-in" type="target" position={Position.Right} />
    <Handle id="right-out" type="source" position={Position.Right} />
    <button type="button" className="nodrag nopan" data-step={step.id} aria-pressed={active} onClick={() => read(step.id)}
      onPointerEnter={e => { if (e.pointerType === "mouse") preview(step.id); }} onPointerLeave={() => preview(null)}
      onFocus={e => { if (e.currentTarget.matches(":focus-visible")) preview(step.id); }} onBlur={() => preview(null)}>
      <span className="station-mark"><Mark size={14} strokeWidth={1.7} /></span>
      <span className="station-name"><strong>{step.title}</strong><small>{condition ?? step.artifact}</small></span>
      <span className="station-leaders" aria-hidden="true" />
    </button>
  </div>;
}

function roundedRoute(points: Point[]) {
  const unique = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let path = `M ${unique[0].x} ${unique[0].y}`;
  for (let i = 1; i < unique.length - 1; i++) {
    const prev = unique[i - 1], turn = unique[i], next = unique[i + 1];
    const before = Math.hypot(turn.x - prev.x, turn.y - prev.y), after = Math.hypot(next.x - turn.x, next.y - turn.y);
    const radius = Math.min(8, before / 2, after / 2);
    path += ` L ${turn.x + (prev.x - turn.x) * radius / before} ${turn.y + (prev.y - turn.y) * radius / before}`;
    path += ` Q ${turn.x} ${turn.y} ${turn.x + (next.x - turn.x) * radius / after} ${turn.y + (next.y - turn.y) * radius / after}`;
  }
  const end = unique[unique.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

function Route({ id, sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps<RouteEdge>) {
  if (!data) return null;
  const { link, stage, trace } = data;
  const path = roundedRoute([{ x: sourceX, y: sourceY }, ...link.bends, { x: targetX, y: targetY }]);
  return <g data-stage={stage}>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} label={link.label} labelX={link.labelAt?.x} labelY={link.labelAt?.y}
      labelStyle={{ fill: "var(--atlas-proof)", fontSize: 12 }} labelBgStyle={{ fill: "var(--atlas-stock)" }}
      labelBgPadding={[7, 3]} interactionWidth={0} />
    {trace && <path key={trace} className={`book-ink-trace ${link.source === trace ? "outgoing" : ""}`} pathLength={1} d={path} fill="none" aria-hidden="true" />}
  </g>;
}

function ReferenceLine({ id, data, sourceX, sourceY, targetX, targetY }: EdgeProps<ReferenceEdge>) {
  if (!data) return null;
  const { sourceLane, targetLane, crossY } = data;
  return <g data-stage={data.scope}><BaseEdge id={id} interactionWidth={0} path={roundedRoute([
    { x: sourceX, y: sourceY }, { x: sourceLane, y: sourceY },
    ...(sourceLane === targetLane ? [] : [{ x: sourceLane, y: crossY }, { x: targetLane, y: crossY }]),
    { x: targetLane, y: targetY }, { x: targetX, y: targetY },
  ])} /></g>;
}
const nodeTypes = { cover: Cover, step: Station, references: MapReferences };
const edgeTypes = { route: Route, reference: ReferenceLine };

export function BookMapCanvas({ layout, selected, touring, enter, jump, locateScope, openScope, readReference, read, pause }: {
  layout: ReturnType<typeof layoutBookMap>; selected: string | null; touring: string | null; enter: (stage: FlowStage) => void;
  jump: { scope: string } | null; locateScope: (scope: string) => void; openScope: (scope: string) => void;
  readReference: (id: string) => void; read: (id: string) => void; pause: () => void;
}) {
  const byId = useMemo(() => new Map(layout.stations.map(station => [station.step.id, station])), [layout]);
  const ports = useMemo(() => {
    const handles = new Map(layout.stations.map(s => [s.step.id, new Set<string>()]));
    for (const link of layout.links) {
      handles.get(link.source)!.add(link.sourceHandle);
      handles.get(link.target)!.add(link.targetHandle);
    }
    for (const link of layout.promptLinks) handles.get(link.stepId)?.add(link.sourceHandle);
    return handles;
  }, [layout]);
  const [hover, preview] = useState<string | null>(null);
  const focus = selected ?? touring ?? hover;
  const trace = focus && byId.has(focus) ? focus : null;
  const highlighted = useMemo(() => {
    const endpoints = new Map<string, RelationKind>();
    for (const link of relationsFor(focus)) {
      endpoints.set(link.stepId === focus ? link.promptId : link.stepId, link.kind);
    }
    return endpoints;
  }, [focus]);
  const neighbors = useMemo(() => {
    const ids = new Set<string>();
    for (const link of layout.links) {
      if (link.source === trace) ids.add(link.target);
      if (link.target === trace) ids.add(link.source);
    }
    return ids;
  }, [layout, trace]);
  const references = useMemo<ReferenceNode[]>(() => layout.sections.map(section => ({
    id: "references-" + section.scope.id, type: "references", position: { x: section.x, y: section.y },
    width: section.width, height: section.height, focusable: false,
    data: { section, selected, read: readReference, openScope, preview, highlighted },
  })), [layout, selected, openScope, readReference, highlighted]);
  const nodes = useMemo<BookNode[]>(() => [
    ...layout.covers.map((cover): CoverNode => ({ id: `stage-${cover.stage.id}`, type: "cover",
      data: { cover, enter, locateScope, lit: !!trace && byId.get(trace)?.stage === cover.stage },
      position: { x: cover.x, y: 0 }, width: cover.width, height: coverHeight, focusable: false })),
    ...layout.stations.map((station): StepNode => ({ id: station.step.id, type: "step",
      data: { station, active: station.step.id === selected, traced: station.step.id === trace, neighbor: neighbors.has(station.step.id),
        ports: [...ports.get(station.step.id)!].join(" "), related: highlighted.get(station.step.id), read, preview },
      position: { x: station.x, y: station.y }, width: station.side ? sideWidth : stepWidth, height: stepHeight, focusable: false })),
    ...references,
  ], [layout, trace, byId, neighbors, selected, ports, read, enter, locateScope, references, highlighted]);
  const edges = useMemo<(RouteEdge | ReferenceEdge)[]>(() => [...layout.links.map((link): RouteEdge => {
    const active = link.source === trace || link.target === trace;
    const source = byId.get(link.source)!;
    return {
      id: `${link.source}-${link.target}`, source: link.source, target: link.target,
      sourceHandle: link.sourceHandle, targetHandle: link.targetHandle, data: { link, stage: source.stage.id, trace: active ? trace : null }, type: "route",
      ariaLabel: `${source.step.title} → ${byId.get(link.target)!.step.title}`,
      className: `book-link book-link-${link.kind}${active ? " is-current" : ""}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 9, height: 9, color: "context-stroke" },
    };
  }), ...layout.promptLinks.map((link): ReferenceEdge => {
    const active = focus === link.stepId || focus === link.promptId;
    return { id: `use-${link.stepId}-${link.promptId}`, source: link.stepId, target: "references-" + link.scope,
      type: "reference", sourceHandle: link.sourceHandle, targetHandle: link.promptId, data: link,
      selectable: false, zIndex: active ? 1 : 0, className: `book-reference-link ${link.kind}${active ? " is-current" : ""}`,
      ariaLabel: `${link.stepTitle} · ${link.kind === "uses" ? "本步使用" : "配套工具"} · ${link.promptTitle}` };
  })], [layout, byId, trace, focus]);
  return <div className={`flow-canvas book-map-canvas ${trace || highlighted.size ? "is-tracing" : ""}`} style={{ "--spine-x": `${spineX}px` } as CSSProperties}
    role="region" aria-label="从开书到整本正文的连续流程图">
    <ReactFlow<BookNode, RouteEdge | ReferenceEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      minZoom={0.08} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false}
      onMoveStart={event => { if (event) { pause(); preview(null); } }} zoomOnDoubleClick={false} zoomOnScroll={false} panOnScroll preventScrolling proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Cross} gap={28} size={3} lineWidth={0.65} color="var(--map-registration)" />
      <BookMapCamera layout={layout} selected={selected} touring={touring} jump={jump} pause={pause} />
    </ReactFlow>
  </div>;
}
