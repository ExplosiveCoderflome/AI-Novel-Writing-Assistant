import { useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, BaseEdge, Controls, Handle, Position, ReactFlow, getViewportForBounds,
  useNodesInitialized, useReactFlow, useStore, type Node, type Edge, type NodeProps, type EdgeProps } from "@xyflow/react";
import { ArrowUpRight, FileText } from "lucide-react";
import { StageImprint } from "../overview/StageImprint";
import type { AtlasPrompt } from "./atlasIndex";
import type { AtlasTopic } from "./atlasTopics";

type TitleNode = Node<{ stage: string; title: string; total: number }, "topic">;
type PromptNode = Node<{ prompt: AtlasPrompt; from: Position; selected: boolean; select: (prompt: AtlasPrompt) => void }, "prompt">;
type AtlasNode = TitleNode | PromptNode;

function TopicHeading({ data }: NodeProps<TitleNode>) {
  return <div className="atlas-topic-node"><StageImprint stage={data.stage} /><div><strong>{data.title}</strong><small>{data.total} 个提示词</small></div>
    <Handle type="source" position={Position.Bottom} /></div>;
}
function PromptLeaf({ data }: NodeProps<PromptNode>) {
  const { prompt } = data;
  return <div className="atlas-leaf">
    <Handle type="target" position={data.from} />
    <button className="nodrag nopan" data-prompt-id={prompt.id} type="button" aria-pressed={data.selected} onClick={() => data.select(prompt)}>
      <FileText size={17} /><span><strong>{prompt.title}</strong><small>
        {prompt.versions[0].outputType === "text" ? "文本输出" : "结构化输出"} · {prompt.versions.length > 1 ? `${prompt.versions.length} 个版本` : prompt.versions[0].version}
      </small></span><ArrowUpRight size={14} /></button>
  </div>;
}
function IndexLine({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const dir = Math.sign(targetX - sourceX);
  const r = Math.min(7, Math.abs(targetX - sourceX) / 2, Math.abs(targetY - sourceY) / 2);
  return <BaseEdge id={id} path={`M ${sourceX} ${sourceY} V ${targetY - r} Q ${sourceX} ${targetY} ${sourceX + dir * r} ${targetY} H ${targetX}`} interactionWidth={0} />;
}
const nodeTypes = { topic: TopicHeading, prompt: PromptLeaf };
const edgeTypes = { index: IndexLine };
const leafWidth = 228;
const leafHeight = 56;
const fitOptions = { padding: 0.12, maxZoom: 1.2 };
function PlaceIndex({ nodes, topic, selected }: { nodes: AtlasNode[]; topic: string; selected: string | null }) {
  const ready = useNodesInitialized();
  const width = useStore(s => s.width), height = useStore(s => s.height);
  const { getNodesBounds, getViewport, setViewport, viewportInitialized } = useReactFlow();
  const previous = useRef("");
  useEffect(() => {
    if (!ready || !viewportInitialized || width < 2 || height < 2) return;
    const sizeKey = `${topic}|${width}|${height}|${nodes.length}`;
    const reframe = previous.current !== sizeKey;
    previous.current = sizeKey;
    let view = getViewport();
    if (reframe) {
      const bounds = getNodesBounds(nodes);
      view = getViewportForBounds(bounds, width, height, 0.16, 1.2, 0.12);
      const zoom = Math.min(0.86, (width - 20) / bounds.width);
      if (view.zoom < zoom) view = { x: (width - bounds.width * zoom) / 2 - bounds.x * zoom, y: 16 - bounds.y * zoom, zoom };
    }
    const item = nodes.find(n => n.id === selected);
    if (item) {
      const x = item.position.x * view.zoom + view.x, y = item.position.y * view.zoom + view.y;
      if (x < 4 || x + leafWidth * view.zoom > width - 4 || y < 4 || y + leafHeight * view.zoom > height - 30) {
        view = { x: width / 2 - (item.position.x + leafWidth / 2) * view.zoom, y: height / 2 - (item.position.y + leafHeight / 2) * view.zoom, zoom: view.zoom };
        void setViewport(view);
        return;
      }
    }
    if (reframe) void setViewport(view);
  }, [ready, viewportInitialized, width, height, topic, selected, nodes, getNodesBounds, getViewport, setViewport]);
  return null;
}

export function AtlasCanvas({ stage, topic, prompts, selected, select }: {
  stage: string; topic: AtlasTopic; prompts: AtlasPrompt[]; selected: string | null; select: (prompt: AtlasPrompt) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState(true);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width) setSpread(entry.contentRect.width >= 560); });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const { nodes, edges } = useMemo(() => {
    const nodes: AtlasNode[] = [{ id: "topic", type: "topic", width: leafWidth, height: 69, focusable: false,
      position: { x: spread ? leafWidth / 2 + 30 : 0, y: 0 }, data: { stage, title: topic.title, total: prompts.length } }];
    const edges: Edge[] = [];
    prompts.forEach((prompt, i) => {
      const right = !spread || i % 2 === 1;
      nodes.push({ id: prompt.id, type: "prompt", width: leafWidth, height: leafHeight, focusable: false,
        position: { x: spread ? (right ? leafWidth + 60 : 0) : 46, y: 104 + (spread ? Math.floor(i / 2) : i) * 74 },
        data: { prompt, from: right ? Position.Left : Position.Right, selected: selected === prompt.id, select } });
      edges.push({ id: "ref-" + prompt.id, source: "topic", target: prompt.id, type: "index", selectable: false, zIndex: selected === prompt.id ? 1 : 0,
        ariaLabel: `${topic.title}收录的提示词：${prompt.title}`, className: selected === prompt.id ? "atlas-index-line chosen" : "atlas-index-line" });
    });
    return { nodes, edges };
  }, [stage, topic, prompts, selected, select, spread]);
  return <div ref={ref} className={`flow-canvas atlas-index-canvas ${spread ? "" : "one-column"}`} role="region" aria-label={topic.title + "提示词分图"}>
    <ReactFlow<AtlasNode> id="prompt-atlas-index" key={topic.id + "-" + spread} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      minZoom={0.16} maxZoom={2.4} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false}
      panOnScroll zoomOnScroll={false} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}
      ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "放大分图", "controls.zoomOut.ariaLabel": "缩小分图", "controls.fitView.ariaLabel": "显示整个分图" }}>
      <Background variant={BackgroundVariant.Cross} gap={28} size={3} color="var(--atlas-hair)" />
      <PlaceIndex nodes={nodes} topic={topic.id} selected={selected} />
      <Controls showInteractive={false} position="bottom-right" fitViewOptions={fitOptions} />
    </ReactFlow>
  </div>;
}
