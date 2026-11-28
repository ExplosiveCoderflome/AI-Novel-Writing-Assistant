import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ArrowUpRight, BookMarked, LibraryBig } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { stepPromptRelations, type RelationKind } from "../atlas/stepPromptRelations";
import { referenceRowHeight, topicHeadingHeight, type MapReferenceSection } from "./referenceLayout";
import "./mapReferences.css";

export type ReferenceNode = Node<{
  section: MapReferenceSection;
  selected: string | null;
  highlighted: ReadonlyMap<string, RelationKind>;
  preview: (id: string | null) => void;
  read: (id: string) => void;
  openScope: (scope: string) => void;
}, "references">;

const linkedPrompts = new Set(stepPromptRelations.map(link => link.promptId));
export const MapReferences = memo(function MapReferences({ data }: NodeProps<ReferenceNode>) {
  const { section, read, selected, highlighted, preview, openScope } = data;
  const tools = section.scope.id === "tools";
  const title = tools ? section.scope.title : section.scope.title + "提示词";
  const Icon = tools ? LibraryBig : BookMarked;
  return <section className={`map-references ${tools ? "tool-references" : ""}`} data-stage={section.scope.skin}
    aria-label={title} style={{ "--reference-row": referenceRowHeight + "px", "--topic-heading": topicHeadingHeight + "px" } as CSSProperties}>
    <h3><button type="button" className="nodrag nopan" data-ref-scope={section.scope.id} onClick={() => openScope(section.scope.id)}
      title={`打开${section.scope.title}的提示词分图`}>
      <Icon size={19} /><strong>{title}</strong><ArrowUpRight aria-hidden size={14} />
    </button></h3>
    {section.topics.map(({ topic, x, y, width, height }) => <div className="map-reference-topic" key={topic.id}
      style={{ left: x, top: y, width, height }}>
      <h4>{topic.title}</h4>
      <ul>{topic.prompts.map(([id, label]) => <li key={id} data-relation={highlighted.get(id)}>
        {linkedPrompts.has(id) && <Handle type="target" id={id} position={x > 0 ? Position.Right : Position.Left} />}
        <button type="button" className="nodrag nopan" data-map-prompt={id} aria-pressed={selected === id}
          onPointerEnter={e => { if (e.pointerType === "mouse") preview(id); }} onPointerLeave={() => preview(null)}
          onFocus={e => { if (e.currentTarget.matches(":focus-visible")) preview(id); }} onBlur={() => preview(null)}
          onClick={() => read(id)}>{label}</button>
      </li>)}</ul>
    </div>)}
  </section>;
});
