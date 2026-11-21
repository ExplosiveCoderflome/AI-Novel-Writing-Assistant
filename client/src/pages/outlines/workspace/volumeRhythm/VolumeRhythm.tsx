import { useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { BeatList } from "./BeatList";
import { inferRequiredChapterCountFromBeatSheet } from "@ai-novel/shared/types/volumeBeatCoverage";
import { generateOutlineVolumeBeats } from "@/api/outlines";
import { Button } from "@/components/ui/button";

export function VolumeRhythm({projectId, volume, chapters, version, disabled, onOpen, onSelect}: {
  projectId:string; volume:OutlineDocument["volumes"][number]; chapters:OutlineDocument["chapters"];
  version:number; disabled:boolean; onOpen:(id:string)=>void; onSelect:(id:string)=>void;
}) {
  const [count, setCount] = useState(String(Math.max(1, chapters.length, volume.beats ? inferRequiredChapterCountFromBeatSheet({beats:volume.beats}) : 0)));
  const cache = useQueryClient();
  const mutationKey = ["outline-volume-beats", projectId, volume.nodeId, version];
  const pending = useIsMutating({mutationKey}) > 0;
  const generate = useMutation({
    mutationKey,
    mutationFn: () => generateOutlineVolumeBeats(projectId,volume.nodeId,version,Number(count)),
    onSuccess: () => cache.invalidateQueries({queryKey:["outline-pending",projectId]}),
  });
  return <section className="outline-passage" aria-label="本卷节奏"><h3>本卷节奏</h3>
    {volume.beats ? <BeatList beats={volume.beats} chapters={chapters} onSelect={onSelect}/> : <p>安排本卷的转折，并确定每个章节主要推进哪一段。</p>}
    <form className="mt-3 flex flex-wrap items-center gap-3" onSubmit={event => {event.preventDefault(); if (!disabled && !pending) generate.mutate(undefined,{onSuccess:p => onOpen(p.id)});}}>
      <label className="inline-flex items-center gap-2 text-sm">本卷预计章数<input className="outline-field w-20" type="number" required min={Math.max(1,chapters.length)} max={2000} value={count} onChange={e=>setCount(e.target.value)}/></label>
      <Button size="sm" variant="secondary" disabled={disabled || pending}>{pending ? "正在规划本卷…" : volume.beats ? "重新拟定节奏建议" : "生成本卷节奏建议"}</Button>
    </form>{generate.isError && <p role="alert">{generate.error.message}</p>}
  </section>;
}
