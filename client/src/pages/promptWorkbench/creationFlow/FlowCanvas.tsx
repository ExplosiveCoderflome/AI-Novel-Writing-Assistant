import { useEffect, useMemo } from "react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useNodesInitialized, useReactFlow, useStore,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { ArrowUpRight, CheckCheck, Feather, Hand, Layers2, Route } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { FlowStage, Step } from "./flowDefinition";

export const kindLabels = { author: "作者操作", ai: "AI 提示词", system: "系统步骤", destination: "继续创作" };
const icons = { author: Hand, ai: Feather, system: Layers2, destination: ArrowUpRight };
type StepNode = Node<{ step: Step; active: boolean; condition?: string; select: (step: Step) => void }, "step">;

function Station({ data }: NodeProps<StepNode>) {
  const { step, active, condition, select } = data;
  const Icon = step.id === "finish" ? CheckCheck : icons[step.kind];
  return <div className={`flow-station ${active ? "is-active" : ""} ${condition ? "is-branch" : ""}`}>
    <Handle type="target" position={Position.Top} id="in" />
    <Handle type="source" position={Position.Bottom} id="out" />
    <Handle type="target" position={Position.Left} id="left-in" />
    <Handle type="source" position={Position.Right} id="right-out" />
    <Handle type="target" position={Position.Right} id="right-in" />
    <Handle type="source" position={Position.Left} id="left-out" />
    <button type="button" aria-pressed={active} onClick={() => select(step)} className="nodrag nopan">
      <span className="station-mark"><Icon size={17} strokeWidth={1.7} aria-hidden /></span>
      <span className="station-text"><strong>{step.title}</strong><small>{condition || kindLabels[step.kind]}</small></span>
    </button>
  </div>;
}
const nodeTypes = { step: Station };
function wire(source: string, target: string, side?: "out" | "back"): Edge {
  const color = side ? "var(--flow-branch)" : "var(--flow-line)";
  return {
    id: `${source}-${target}`, source, target, type: "smoothstep",
    sourceHandle: side === "out" ? "right-out" : side === "back" ? "left-out" : "out",
    targetHandle: side === "out" ? "left-in" : side === "back" ? "right-in" : "in",
    style: { stroke: color, strokeWidth: 1.5, strokeDasharray: side ? "4 4" : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
  };
}

const fitOptions = { padding: 0.18, maxZoom: 1.25 };
function FitOnResize() {
  const initialized = useNodesInitialized();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (initialized && width > 1 && height > 1) void fitView(fitOptions);
  }, [initialized, width, height, fitView]);
  return null;
}

export function FlowCanvas({ stage, current, select }: { stage: FlowStage; current: string; select: (step: Step) => void }) {
  const { nodes, edges } = useMemo(() => {
    const station = (step: Step, row: number, branch: boolean, condition?: string): StepNode => ({
      id: step.id, type: "step", position: { x: branch ? 240 : 0, y: row * 86 },
      width: 196, height: 54, focusable: false, data: { step, active: step.id === current, condition, select },
    });
    const nodes = stage.main.map((step, index) => station(step, index, false));
    const edges = stage.main.slice(1).map((step, index) => wire(stage.main[index].id, step.id));
    for (const branch of stage.branches ?? []) {
      edges.push(wire(branch.from, branch.steps[0].id, "out"));
      branch.steps.forEach((step, index) => {
        nodes.push(station(step, branch.row + index, true, index === 0 ? branch.label : "修文后"));
        if (index > 0) edges.push(wire(branch.steps[index - 1].id, step.id));
      });
      if (branch.join) edges.push(wire(branch.steps[branch.steps.length - 1].id, branch.join, "back"));
    }
    return { nodes, edges };
  }, [stage, current, select]);

  return <div className="flow-canvas" role="region" aria-label={stage.title + "步骤图"}>
    <ReactFlow<StepNode> key={stage.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      fitView fitViewOptions={fitOptions} minZoom={0.4} maxZoom={1.8}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false}
      zoomOnDoubleClick={false} zoomOnScroll={false} preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "放大流程图", "controls.zoomOut.ariaLabel": "缩小流程图", "controls.fitView.ariaLabel": "显示全部步骤" }}>
      <Background gap={20} size={1} color="var(--flow-dot)" />
      <FitOnResize />
      <Controls showInteractive={false} position="bottom-right" fitViewOptions={fitOptions} />
    </ReactFlow>
    <span className="flow-canvas-key"><Route size={14} aria-hidden />实线主流程 · 虚线按需进入</span>
  </div>;
}
