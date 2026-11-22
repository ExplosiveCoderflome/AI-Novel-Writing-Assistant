import { formatVolumeBeatDisplayLabel } from "@ai-novel/shared/types/volumeBeatSlots";
import { useState } from "react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { createOutlineId } from "../outlineNodes";
import { Button } from "@/components/ui/button";

const kinds = { volume: "卷", chapter: "章节", character: "人物", payoff: "伏笔", fact: "固定设定" };
type Kind = keyof typeof kinds;

export function OutlineAddNode({ document, selectedId, disabled, onAdd, onCancel }: {
  document: OutlineDocument;
  selectedId: string;
  disabled: boolean;
  onAdd: (document: OutlineDocument, nodeId: string) => void;
  onCancel: () => void;
}) {
  const selectedVolume = document.volumes.find(item => item.nodeId === selectedId)?.nodeId
    ?? document.chapters.find(item => item.nodeId === selectedId)?.volumeNodeId;
  const [kind, setKind] = useState<Kind>(selectedVolume ? "chapter" : "volume");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState(selectedVolume ?? document.volumes[0]?.nodeId ?? "");
  const [beatKey, setBeatKey] = useState("");
  const volume = document.volumes.find(item => item.nodeId === parentId);
  const eligible = title.trim() && (kind !== "chapter" || volume) && !disabled;
  function add() {
    if (!eligible) return;
    const nodeId = createOutlineId();
    const name = title.trim();
    const base = { nodeId, title: name };
    const nextOrder = (nodes: { order: number }[]) => nodes.reduce((highest, item) => Math.max(highest, item.order), -1) + 1;
    let next: OutlineDocument;
    switch (kind) {
      case "volume":
        next = { ...document, volumes: [...document.volumes, { ...base, order: nextOrder(document.volumes), planningDepth: "rough", summary: "", chapterNodeIds: [] }] };
        break;
      case "chapter":
        if (!volume) return;
        const beat = volume.beats?.find(b => b.key === beatKey);
        next = { ...document,
          volumes: document.volumes.map(item => item === volume ? { ...item, chapterNodeIds: [...item.chapterNodeIds, nodeId] } : item),
          chapters: [...document.chapters, { ...base, volumeNodeId: volume.nodeId, ...(beat && {beatKey:beat.key}), order: nextOrder(document.chapters.filter(item => item.volumeNodeId === volume.nodeId)),
            planningDepth: "rough", summary: "", characterNodeIds: [], payoffNodeIds: [] }],
        };
        break;
      case "character":
        next = { ...document, characters: [...document.characters, { nodeId, name, appearanceNodeIds: [] }] };
        break;
      case "payoff":
        next = { ...document, payoffs: [...document.payoffs, { ...base, kind: "foreshadowing", setupDescription: "", payoffDescription: "", setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [] }] };
        break;
      case "fact":
        next = { ...document, facts: [...document.facts, { ...base, content: "", scope: { type: "story" }, immutable: true, relatedNodeIds: [] }] };
        break;
    }
    onAdd(next, nodeId);
  }
  return <form className="mb-4 space-y-3 bg-muted/45 p-3" onSubmit={event => { event.preventDefault(); add(); }}>
    <select className="outline-field" value={kind} aria-label="添加类型" onChange={event => setKind(event.target.value as Kind)}>
      {Object.entries(kinds).map(([key, label]) => <option key={key} value={key} disabled={key === "chapter" && !document.volumes.length}>{label}</option>)}
    </select>
    {kind === "chapter" && <label className="block text-xs">所属卷
      <select className="outline-field mt-1" value={parentId} onChange={event => {setParentId(event.target.value); setBeatKey("");}}>
        {document.volumes.map(item => <option value={item.nodeId} key={item.nodeId}>{item.title}</option>)}
      </select>
    </label>}
    {kind === "chapter" && volume?.beats && <label className="block text-xs">所属节奏段
      <select className="outline-field mt-1" value={beatKey} onChange={event => setBeatKey(event.target.value)}>
        <option value="">暂未关联</option>{volume.beats.map(beat => <option key={beat.key} value={beat.key}>{formatVolumeBeatDisplayLabel(beat)}</option>)}
      </select>
    </label>}
    <label className="block text-xs">{kind === "character" ? "人物姓名" : "标题"}
      <input autoFocus className="outline-field mt-1" value={title} onChange={event => setTitle(event.target.value)} />
    </label>
    <div className="flex flex-wrap gap-1"><Button type="submit" size="sm" disabled={!eligible}>添加{kinds[kind]}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button></div>
  </form>;
}
