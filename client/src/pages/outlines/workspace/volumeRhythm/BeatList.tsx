import type { VolumeBeat } from "@ai-novel/shared/types/novel";
import { formatVolumeBeatDisplayLabel } from "@ai-novel/shared/types/volumeBeatSlots";

type ChapterLink = {nodeId?:string; title:string; beatKey?:string | null};
export function BeatList({beats, chapters, onSelect}: {beats:VolumeBeat[]; chapters:ChapterLink[]; onSelect?:(id:string)=>void}) {
  return <ol>{beats.map(beat => {
    const linked = chapters.filter(ch => ch.beatKey === beat.key);
    return <li className="outline-volume" key={beat.key}><details>
      <summary>{formatVolumeBeatDisplayLabel(beat)} <small>{beat.chapterSpanHint} · 已关联 {linked.length} 章</small></summary>
      <p>{beat.summary}</p><ul>{beat.mustDeliver.map((text,i) => <li key={i}>{text}</li>)}</ul>
      {linked.length ? <ul>{linked.map((ch,index) => <li key={ch.nodeId ?? index}>
        {onSelect && ch.nodeId ? <button type="button" className="outline-reading-link" onClick={()=>onSelect(ch.nodeId!)}>{ch.title}</button> : ch.title}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">尚未关联章节</p>}
    </details></li>;
  })}</ol>;
}
