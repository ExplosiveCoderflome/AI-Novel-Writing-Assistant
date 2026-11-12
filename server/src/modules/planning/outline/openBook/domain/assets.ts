import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookMapping } from "@ai-novel/shared/types/outlineOpenBook";
import { buildVolumeWorkspaceDocument } from "../../../../../services/novel/volume/volumeWorkspaceDocument";
export function buildOutlineWorkspace(novelId: string, doc: OutlineDocument, mapping: OutlineBookMapping, chapterLength: number, versionId: string) {
  const time = new Date(0).toISOString();
  return buildVolumeWorkspaceDocument({novelId, activeVersionId: versionId, volumes: mapping.volumes.map((mapped, i) => {
    const source = doc.volumes.find(v => v.nodeId === mapped.nodeId)!;
    const chapters = mapping.chapters.filter(c => c.volumeId === mapped.volumeId).map(m => {
      const c = doc.chapters.find(c => c.nodeId === m.nodeId)!;
      const appearances = doc.characters.filter(p => c.characterNodeIds.includes(p.nodeId) || p.appearanceNodeIds.includes(c.nodeId));
      const characterIds = appearances.map(p => mapping.characters.find(x => x.nodeId === p.nodeId)!.characterId);
      return {id: m.planId, volumeId: m.volumeId, chapterId: m.chapterId, chapterOrder: m.chapterOrder,
        title: c.title || `第${m.chapterOrder}章`, summary: c.summary, purpose: c.purpose,
        ...(characterIds.length ? {plannedCharacterIds: characterIds} : {}), targetWordCount: chapterLength,
        payoffRefs: c.payoffNodeIds.map(id => { const p = doc.payoffs.find(p => p.nodeId === id)!; return `计划：${p.title} [${mapping.payoffs.find(p => p.nodeId === id)!.ledgerKey}]`; }),
        createdAt: time, updatedAt: time};
    });
    return {id: mapped.volumeId, novelId, sortOrder: i + 1, title: source.title || `第${i + 1}卷`, summary: source.summary,
      mainPromise: source.promise, primaryPressureSource: source.pressure, protagonistChange: source.protagonistChange,
      climax: source.climax, nextVolumeHook: source.endingHook, sourceVersionId: versionId,
      status: chapters.length === mapped.chapterQuota ? "chapter_list_generated" : "chapter_list_partial",
      chapters, openPayoffs: doc.payoffs.filter(p => [...p.setupChapterNodeIds, ...p.payoffChapterNodeIds].some(id => mapping.chapters.some(m => m.volumeId === mapped.volumeId && m.nodeId === id))).map(p => `计划：${p.title} [${mapping.payoffs.find(m => m.nodeId === p.nodeId)!.ledgerKey}]`),
      createdAt: time, updatedAt: time};
  })});
}
