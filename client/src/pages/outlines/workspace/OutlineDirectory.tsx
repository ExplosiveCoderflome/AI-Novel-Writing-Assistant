import { formatVolumeBeatDisplayLabel } from "@ai-novel/shared/types/volumeBeatSlots";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { getOutlineNodeTitle, type OutlineNode } from "../outlineNodes";

import { OutlineAddNode } from "./OutlineAddNode";

interface Props {
  disabled: boolean;
  onAdd: (document: OutlineDocument, nodeId: string) => void;
  document: OutlineDocument;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function OutlineDirectory({ document, selectedId, disabled, onSelect, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const matches = (node: OutlineNode) => getOutlineNodeTitle(node).toLocaleLowerCase().includes(term);
  const volumes = useMemo(() => [...document.volumes].sort((a, b) => a.order - b.order), [document.volumes]);
  const chapters = useMemo(() => {
    const grouped = new Map<string, OutlineDocument["chapters"]>();
    const volumeIds = new Set(volumes.map(volume => volume.nodeId));
    for (const chapter of [...document.chapters].sort((a, b) => a.order - b.order)) {
      const key = volumeIds.has(chapter.volumeNodeId) ? chapter.volumeNodeId : "";
      const group = grouped.get(key);
      if (group) group.push(chapter);
      else grouped.set(key, [chapter]);
    }
    return grouped;
  }, [document.chapters, volumes]);
  const parent = document.chapters.find(chapter => chapter.nodeId === selectedId)?.volumeNodeId;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(volumes[0] ? [volumes[0].nodeId] : []));
  useEffect(() => {
    if (parent) setExpanded(previous => new Set(previous).add(parent));
  }, [parent, selectedId]);

  const row = (item: OutlineNode) => <button type="button" title={getOutlineNodeTitle(item)}
    className="outline-node" aria-current={item.nodeId === selectedId ? "true" : undefined}
    onClick={() => onSelect(item.nodeId)}>{getOutlineNodeTitle(item)}</button>;
  const groups = [
    { title: "人物", items: document.characters },
    { title: "伏笔与钩子", items: document.payoffs },
    { title: "固定设定", items: document.facts },
  ];
  const matchesBeat = (beat: {label:string; title?:string|null}) => formatVolumeBeatDisplayLabel(beat).toLocaleLowerCase().includes(term);
  const visibleVolumes = volumes.filter(volume => matches(volume) || volume.beats?.some(matchesBeat) || chapters.get(volume.nodeId)?.some(matches));
  const unassigned = (chapters.get("") ?? []).filter(matches);
  const showStory = matches(document.story) || "总纲".includes(term);
  const groupsWithResults = groups.map(group => ({ ...group, items: group.items.filter(matches) })).filter(group => group.items.length > 0);

  return <nav className="outline-directory" aria-label="大纲目录">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="font-semibold">大纲目录</h2>
      <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-primary" aria-label="添加大纲内容" title="添加大纲内容" aria-expanded={adding}
        disabled={disabled} onClick={() => setAdding(open => !open)}><Plus size={14} aria-hidden />添加</button>
    </div>
    {adding && <OutlineAddNode document={document} selectedId={selectedId} disabled={disabled}
      onAdd={(next, id) => { setAdding(false); setSearch(""); onAdd(next, id); }} onCancel={() => setAdding(false)} />}
    <label className="mb-4 flex items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring">
      <Search size={15} aria-hidden className="shrink-0 text-muted-foreground" />
      <input type="search" aria-label="搜索大纲目录" placeholder="搜索标题或姓名" value={search}
        className="h-9 w-full min-w-0 bg-transparent text-sm outline-none" onChange={event => setSearch(event.target.value)} />
    </label>
    {showStory && <button type="button" className="outline-node flex items-center gap-2"
      aria-current={selectedId === document.story.nodeId ? "true" : undefined} onClick={() => onSelect(document.story.nodeId)}>
      <BookOpen size={16} aria-hidden />总纲
    </button>}
    {(visibleVolumes.length > 0 || unassigned.length > 0) && <section className="outline-nav-group">
      <h3>卷与章节</h3>
      {visibleVolumes.map(volume => {
        const children = chapters.get(volume.nodeId) ?? [];
        const showChildren = !!term || expanded.has(volume.nodeId);
        return <div key={volume.nodeId}>
          <div className="flex items-center">
            {children.length || volume.beats?.length ? <button type="button" className="outline-branch" aria-expanded={showChildren}
              aria-label={`${showChildren ? "收起" : "展开"}《${volume.title}》的章节`} disabled={!!term}
              onClick={() => setExpanded(previous => {
                const next = new Set(previous);
                if (next.has(volume.nodeId)) next.delete(volume.nodeId); else next.add(volume.nodeId);
                return next;
              })}>{showChildren ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="w-6 shrink-0" />}
            {row(volume)}
          </div>
          {showChildren && (children.length > 0 || !!volume.beats?.length) && <ul className="outline-nav-children" aria-label={`${volume.title}的章节`}>
            {volume.beats?.map(beat => {
              const linked = children.filter(ch => ch.beatKey === beat.key && (matchesBeat(beat) || matches(volume) || matches(ch)));
              if (term && !matchesBeat(beat) && !matches(volume) && !linked.length) return null;
              return <li key={beat.key}><details open={!!term || linked.some(ch=>ch.nodeId===selectedId) || undefined}>
                <summary className="cursor-pointer py-1 text-xs">{formatVolumeBeatDisplayLabel(beat)} <span className="text-muted-foreground">{beat.chapterSpanHint}</span></summary>
                <ul>{linked.map(ch=><li key={ch.nodeId}>{row(ch)}</li>)}</ul></details></li>;
            })}
            {volume.beats && children.some(ch=>!ch.beatKey && (matches(volume) || matches(ch))) && <li className="text-xs text-muted-foreground">待关联章节</li>}
            {children.filter(ch=>!ch.beatKey).filter(chapter => matches(volume) || matches(chapter)).map(chapter => <li key={chapter.nodeId}>{row(chapter)}</li>)}
          </ul>}
        </div>;
      })}
      {unassigned.length > 0 && <><h3>未归卷章节</h3><ul>{unassigned.map(item => <li key={item.nodeId}>{row(item)}</li>)}</ul></>}
    </section>}
    {groupsWithResults.map(group => <section key={group.title} className="outline-nav-group">
      <h3>{group.title}<span>{group.items.length}</span></h3>
      <ul>{group.items.map(item => <li key={item.nodeId}>{row(item)}</li>)}</ul>
    </section>)}
    {!showStory && !visibleVolumes.length && !unassigned.length && !groupsWithResults.length && <p role="status" className="text-sm text-muted-foreground">没有找到“{search.trim()}”</p>}
  </nav>;
}
