import type { OutlineDocument } from "@ai-novel/shared/types/outline";

/** Transparent arithmetic suggestions, never a prediction of story pacing. */
export function suggestVolumeQuotas(document: OutlineDocument, total: number): Record<string, number> {
  const volumes = [...document.volumes].sort((a,b) => a.order-b.order);
  const counts = Object.fromEntries(volumes.map(volume => [volume.nodeId, document.chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).length]));
  const quotas = Object.fromEntries(volumes.map(volume => [volume.nodeId, Math.max(1, counts[volume.nodeId]) ]));
  const flexible = volumes.filter(volume => volume.planningDepth === "rough" || !counts[volume.nodeId]);
  const targets = flexible.length ? flexible : volumes;
  const remaining = Math.max(0, total-Object.values(quotas).reduce((sum,value)=>sum+value,0));
  for (let index=0;index<remaining && targets.length;index++) quotas[targets[index%targets.length].nodeId]++;
  return quotas;
}
export function suggestedChapterCount(document: OutlineDocument): number {
  const complete = document.volumes.length && document.volumes.every(volume => volume.planningDepth === "detailed" && document.chapters.some(chapter => chapter.volumeNodeId === volume.nodeId));
  return complete ? document.chapters.length : Math.max(80, document.chapters.length, document.volumes.length);
}
export function nextUnwrittenChapter(chapters: Array<{order:number;content:string|null}>, total:number): number | null {
  const written = new Set(chapters.filter(chapter=>chapter.content?.trim()).map(chapter=>chapter.order));
  for (let order=1;order<=total;order++) if (!written.has(order)) return order;
  return null;
}
