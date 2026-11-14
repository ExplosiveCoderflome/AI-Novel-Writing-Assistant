import type { Prisma } from "@prisma/client";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { OutlineBookMapping, OutlineBookPolicy } from "@ai-novel/shared/types/outlineOpenBook";
import { currentOutlinePlanning, readOutlinePlanningState, assertOutlineReference, type OutlinePlanningState } from "../application/OutlinePlanningContext";
import { canonicalJson } from "./mapping";
import { OutlineOpenBookError } from "./errors";
function conflict(field: string): never { throw new OutlineOpenBookError("OUTLINE_PRESERVED_FIELD", `保留内容发生冲突：${field}。请保留原内容或明确调整保留策略。`); }
const text = (value: unknown) => typeof value === "string" ? value.trim() : value ?? null;
const volumeFields: Record<string, string> = {title: "title", summary: "summary", promise: "mainPromise", pressure: "primaryPressureSource", protagonistChange: "protagonistChange", climax: "climax", endingHook: "nextVolumeHook"};
const chapterFields: Record<string, string> = {title: "title", summary: "summary", purpose: "purpose"};
/** Guard-pinned chapter fields, keyed by workspace plan chapter id. Read-path hydration
 *  must leave these untouched: the persisted workspace already carries the preserved
 *  values, and overwriting them with diverged execution briefs makes the guard reject
 *  every later write through the same document. Mirrors the chapter-field filter in
 *  assertOutlineWorkspaceCandidate (same mode exclusion, same field table). */
export async function readPreservedChapterFields(db: Pick<Prisma.TransactionClient, "outlineBookBinding">, novelId: string): Promise<Map<string, ReadonlySet<string>>> {
  const preserved = new Map<string, Set<string>>();
  const binding = await db.outlineBookBinding.findUnique({where: {novelId}});
  if (!binding) return preserved;
  const mapping = JSON.parse(binding.mappingJson) as OutlineBookMapping;
  const policy = JSON.parse(binding.policyJson) as OutlineBookPolicy;
  const planByNode = new Map(mapping.chapters.map(c => [c.nodeId, c.planId]));
  for (const rule of policy.rules) {
    if (rule.mode === "fill_missing") continue;
    const docField = chapterFields[rule.field];
    if (!docField) continue;
    const planId = planByNode.get(rule.nodeId);
    if (!planId) continue;
    const fields = preserved.get(planId) ?? new Set<string>();
    fields.add(docField);
    preserved.set(planId, fields);
  }
  return preserved;
}
export function assertOutlineWorkspaceCandidate(state: OutlinePlanningState, candidate: VolumePlanDocument) {
  const {mapping: m, policy} = state;
  for (const mapped of m.volumes) {
    const volume = candidate.volumes.find(v => v.id === mapped.volumeId);
    if (!volume) conflict(mapped.nodeId);
    if (volume.sortOrder !== m.volumes.indexOf(mapped) + 1) conflict(`${mapped.nodeId}.order`);
    for (const r of policy.rules.filter(r => r.nodeId === mapped.nodeId && volumeFields[r.field] && r.mode !== "fill_missing"))
      if (canonicalJson(text(volume[volumeFields[r.field] as keyof typeof volume])) !== canonicalJson(text(r.value))) conflict(`${r.nodeId}.${r.field}`);
    for (const c of volume.chapters) if (c.chapterOrder < mapped.from || c.chapterOrder > mapped.to) conflict(`章${c.chapterOrder}超出卷槽位`);
  }
  const allSlots = [...m.volumes, ...(m.runtimeVolumes ?? [])];
  if (allSlots.length) for (const v of candidate.volumes) {
    const slot = allSlots.find(s => s.volumeId === v.id);
    if (!slot) conflict(`未确认的卷${v.title}`);
    for (const c of v.chapters) if (c.chapterOrder < slot.from || c.chapterOrder > slot.to) conflict(`章${c.chapterOrder}超出卷槽位`);
  }
  for (const mapped of m.chapters) {
    const volume = candidate.volumes.find(v => v.id === mapped.volumeId);
    const chapter = volume?.chapters.find(c => c.id === mapped.planId);
    if (!chapter || chapter.chapterOrder !== mapped.chapterOrder || chapter.chapterId !== mapped.chapterId) conflict(`${mapped.nodeId}.identity`);
    const source = state.document.chapters.find(c => c.nodeId === mapped.nodeId)!;
    const retainedCast = state.document.characters.filter(c => source.characterNodeIds.includes(c.nodeId) || c.appearanceNodeIds.includes(source.nodeId)).map(c => m.characters.find(p => p.nodeId === c.nodeId)!.characterId);
    if (retainedCast.length && retainedCast.some(id => !chapter.plannedCharacterIds?.includes(id))) conflict(`${mapped.nodeId}.characterNodeIds`);
    for (const nodeId of source.payoffNodeIds) {
      const key = m.payoffs.find(p => p.nodeId === nodeId)!.ledgerKey;
      if (!chapter.payoffRefs.some(ref => ref.includes(`[${key}]`))) conflict(`${mapped.nodeId}.payoffNodeIds`);
    }
    for (const r of policy.rules.filter(r => r.nodeId === mapped.nodeId && chapterFields[r.field] && r.mode !== "fill_missing"))
      if (canonicalJson(text(chapter[chapterFields[r.field] as keyof typeof chapter])) !== canonicalJson(text(r.value))) conflict(`${r.nodeId}.${r.field}`);
  }
  if (state.baseline && currentOutlinePlanning()?.novelId === state.novelId) {
    const before = state.baseline.volumes.flatMap(v => v.chapters);
    const after = candidate.volumes.flatMap(v => v.chapters);
    const creative = (c: typeof before[number]) => {const {createdAt, updatedAt, ...rest} = c;return rest;};
    for (const c of after) {
      if (c.chapterOrder >= state.range.from && c.chapterOrder <= state.range.to) continue;
      const old = before.find(x => x.id === c.id);
      if (!old || canonicalJson(creative(old)) !== canonicalJson(creative(c))) conflict(`非授权章${c.chapterOrder}`);
    }
    for (const c of before) if (!after.some(x => x.id === c.id)) conflict(`删除已有章${c.chapterOrder}`);
  }
}
export async function assertOutlineWorkspaceWrite(tx: Prisma.TransactionClient, novelId: string, candidate: VolumePlanDocument) {
  // Legacy persistence doubles intentionally expose only the delegates owned by their test boundary.
  if (!tx.outlineBookBinding) return;
  const active = currentOutlinePlanning();
  const state = active?.novelId === novelId ? active : await readOutlinePlanningState(tx, novelId);
  if (!state) return;
  await assertOutlineReference(tx, novelId, state.ref);
  if (active?.novelId === novelId && state.previousActualResult) {
    const previous = await tx.chapter.findFirst({where: {id: state.previousActualResult.chapterId, novelId}, select: {content: true}});
    // Execution metadata sync also touches updatedAt; only changed actual text invalidates this context.
    if (!previous || previous.content !== state.previousActualResult.content)
      throw new OutlineOpenBookError("OUTLINE_PREVIOUS_CHAPTER_CHANGED", "前章正文在准备期间发生变化，请依据最新正文重新准备。");
  }
  assertOutlineWorkspaceCandidate(state, candidate);
}
