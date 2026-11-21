import { useEffect, useMemo, useRef, useState } from "react";
import {
  Controls, Handle, MarkerType, Position, ReactFlow, getViewportForBounds, useNodesInitialized, useReactFlow, useStore,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { ArrowRight, CornerDownRight, GitBranch } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { ManuscriptFigure } from "./ManuscriptFigure";
import { stages, type Branch, type FlowStage, type Step } from "./flowDefinition";

export const kindLabels = { author: "作者操作", ai: "AI 提示词", system: "系统步骤", destination: "继续创作" };
type StationNode = Node<{
  step: Step; order: number; active: boolean; across: boolean; read: (step: Step) => void;
}, "station">;
type NotesNode = Node<{
  branches: Branch[]; current?: string; across: boolean; stage: FlowStage; read: (step: Step) => void; jump: (id: string) => void;
}, "notes">;
type AtlasNode = StationNode | NotesNode;

function Station({ data }: NodeProps<StationNode>) {
  const { step, order, active, across, read } = data;
  return <div className={`map-station ${across ? "across" : "down"} ${active ? "selected" : ""}`}>
    <Handle type="target" id="in" position={across ? Position.Left : Position.Top} />
    <Handle type="source" id="out" position={across ? Position.Right : Position.Bottom} />
    <Handle type="source" id="branch" position={across ? Position.Bottom : Position.Right} />
    <button type="button" className="nodrag nopan" aria-pressed={active} onClick={() => read(step)}>
      <span className="map-figure"><ManuscriptFigure id={step.id} /></span>
      <span className="map-station-caption">
        <small><b>{String(order + 1).padStart(2, "0")}</b>{kindLabels[step.kind]}</small>
        <strong>{step.title}</strong><span>{step.artifact}</span>
      </span>
    </button>
  </div>;
}

function BranchNotes({ data }: NodeProps<NotesNode>) {
  const { branches, current, across, stage, read, jump } = data;
  return <div className="map-branch-notes">
    <Handle type="target" id="entry" position={across ? Position.Top : Position.Left} />
    {branches.map(branch => {
      const last = branch.steps[branch.steps.length - 1];
      const target = branch.join ?? last.destination;
      const targetTitle = branch.join ? stage.main.find(step => step.id === branch.join)?.title
        : stages.flatMap(item => item.main).find(step => step.id === target)?.title;
      return <section className="map-annotation" key={branch.steps[0].id}>
        <span className="map-condition"><GitBranch size={12} />{branch.label}</span>
        {branch.steps.map((step, i) => <button type="button" className="map-branch-step nodrag nopan" key={step.id}
          aria-pressed={current === step.id} onClick={() => read(step)}>
          {i > 0 && <CornerDownRight size={13} />}<strong>{step.title}</strong><ArrowRight size={12} />
        </button>)}
        {target && <button className="map-return nodrag nopan" type="button" onClick={() => jump(target)}>
          <CornerDownRight size={12} />{branch.join ? "接回" : "前往"} · {targetTitle}
        </button>}
      </section>;
    })}
  </div>;
}
const nodeTypes = { station: Station, notes: BranchNotes };
const fitOptions = { padding: 0.11, maxZoom: 1.25 };

function PlaceDiagram({ across }: { across: boolean }) {
  const ready = useNodesInitialized();
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const { getNodes, getNodesBounds, setViewport } = useReactFlow();
  useEffect(() => {
    if (!ready || width < 2 || height < 2) return;
    const nodes = getNodes();
    if (!nodes.length) return;
    const bounds = getNodesBounds(nodes);
    const fitting = getViewportForBounds(bounds, width, height, 0.35, 1.25, 0.12);
    // Keep type legible on short windows. Start at the first station; the fit control still shows the whole stage.
    const zoom = Math.max(Math.min(0.82, (width - 16) / bounds.width), fitting.zoom);
    void setViewport({
      zoom, x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: Math.max(16, (height - bounds.height * zoom) / 2) - bounds.y * zoom,
    });
  }, [ready, across, width, height, getNodes, getNodesBounds, setViewport]);
  return null;
}

export function FlowCanvas({ stage, current, select, jump }: {
  stage: FlowStage; current?: string; select: (step: Step) => void; jump: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [across, setAcross] = useState(false);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const resize = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setAcross(entry.contentRect.width >= 840);
    });
    resize.observe(el);
    return () => resize.disconnect();
  }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: AtlasNode[] = [];
    const edges: Edge[] = [];
    let y = 0;
    stage.main.forEach((step, i) => {
      const branches = stage.branches?.filter(branch => branch.from === step.id) ?? [];
      const width = across ? 179 : 266;
      const height = across ? 162 : 88;
      const x = across ? i * (width + 42) : 0;
      const notesHeight = branches.reduce((sum, branch) => sum + 54 + 26 * branch.steps.length, 0);
      const rowHeight = Math.max(height, notesHeight);
      const top = across ? 0 : y + (rowHeight - height) / 2;
      nodes.push({ id: step.id, type: "station", position: { x, y: top }, width, height, focusable: false,
        data: { step, order: i, across, active: current === step.id, read: select } });
      if (i > 0) edges.push({ id: `main-${i}`, source: stage.main[i-1].id, target: step.id,
        sourceHandle: "out", targetHandle: "in", type: "straight", className: "map-main-edge",
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: "var(--atlas-ink)" } });
      if (branches.length) {
        const id = `notes-${step.id}`;
        nodes.push({ id, type: "notes", position: { x: across ? x : width + 42, y: across ? height + 38 : y + (rowHeight - notesHeight) / 2 },
          width: across ? width : 186, height: notesHeight, focusable: false,
          data: { stage, branches, current, across, read: select, jump } });
        edges.push({ id: `branch-${step.id}`, source: step.id, target: id, sourceHandle: "branch", targetHandle: "entry",
          type: "straight", className: "map-side-edge" });
      }
      y += rowHeight + 24;
    });
    return { nodes, edges };
  }, [stage, current, select, jump, across]);
  return <div className="flow-canvas" ref={container} role="region" aria-label={stage.title + "步骤图"}>
    <ReactFlow<AtlasNode> key={`${stage.id}-${across}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      fitView fitViewOptions={fitOptions} minZoom={0.35} maxZoom={2} nodesDraggable={false} nodesConnectable={false}
      elementsSelectable={false} edgesFocusable={false} zoomOnDoubleClick={false} zoomOnScroll={false}
      panOnScroll preventScrolling proOptions={{ hideAttribution: true }}
      ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "放大流程图", "controls.zoomOut.ariaLabel": "缩小流程图", "controls.fitView.ariaLabel": "显示全部步骤" }}>
      <PlaceDiagram across={across} />
      <Controls showInteractive={false} position="bottom-right" fitViewOptions={fitOptions} />
    </ReactFlow>
  </div>;
}
