import { createContext, useContext, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import type { AnchoredVolumeEmphasis } from "@ai-novel/shared/types/director/volumeEmphasis";
import { annotateVolumeSummaries } from "@/api/directorNext";
import type { WorkspaceBook } from "../model";

const EmphasisContext = createContext<ReadonlyMap<string, AnchoredVolumeEmphasis>>(new Map());

export function VolumeEmphasisProvider({ book, children }: { book: WorkspaceBook; children: ReactNode }) {
  const volumes = (book.planning?.volumes ?? book.materials.volumes).filter(volume => volume.summary?.trim());
  const batches = [];
  for (let i = 0; i < volumes.length; i += 8) batches.push(volumes.slice(i, i + 8));
  const queries = useQueries({ queries: batches.map(batch => ({
    queryKey: ["director-volume-emphasis", book.novel.id, batch.map(volume => [volume.id, volume.summary])],
    queryFn: () => annotateVolumeSummaries(book.novel.id, batch.map(volume => volume.id)),
    staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false,
  })) });
  const marks = new Map(queries.flatMap(query => (query.data ?? []).map(mark => [mark.id, mark] as const)));
  const failed = queries.filter(query => query.isError);
  return <EmphasisContext.Provider value={marks}>
    <div className="flex h-full min-h-0 flex-col">
      {queries.some(query => query.isFetching && !query.data) ? <p role="status" className="px-2 py-1 text-xs text-muted-foreground sm:px-6">正在标注卷纲中的冲突与转折…</p> : null}
      {failed.length > 0 ? <p role="status" className="px-2 py-1 text-xs text-muted-foreground sm:px-6">部分卷纲重点未能标注。 <button type="button" className="text-primary underline" onClick={() => failed.forEach(query => { void query.refetch(); })}>重试标注</button></p> : null}
      {children}
    </div>
  </EmphasisContext.Provider>;
}

export function VolumeSummaryText({ id, text }: { id: string; text?: string | null }) {
  const mark = useContext(EmphasisContext).get(id);
  if (!text || !mark || mark.summary !== text) return <>{text}</>;
  const spans = [mark.conflict, mark.turn].flatMap(quote => {
    if (!quote) return [];
    const start = text.indexOf(quote);
    return start >= 0 && start === text.lastIndexOf(quote) ? [{ start, end: start + quote.length }] : [];
  }).sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < spans.length; i++) {
    const {start} = spans[i];
    let end = spans[i].end;
    while (i + 1 < spans.length && spans[i + 1].start <= end) {
      i += 1;
      end = Math.max(end, spans[i].end);
    }
    parts.push(text.slice(cursor, start), <strong key={start} className="font-bold text-foreground">{text.slice(start, end)}</strong>);
    cursor = end;
  }
  return <>{parts}{text.slice(cursor)}</>;
}
