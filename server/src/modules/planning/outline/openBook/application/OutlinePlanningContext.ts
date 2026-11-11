import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBindingRef, OutlineBookMapping, OutlineBookPolicy } from "@ai-novel/shared/types/outlineOpenBook";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { outlineHash } from "../domain/mapping";
import { OutlineOpenBookError } from "../domain/errors";
import { withRequiredPromptContext } from "../../../../../prompting/core/requiredContext";

type BindingDb = Pick<Prisma.TransactionClient, "outlineBookBinding" | "outlineRevision" | "volumePlanVersion" | "chapter">;
export interface OutlinePlanningState {
  novelId: string; ref: OutlineBindingRef; document: OutlineDocument; mapping: OutlineBookMapping; policy: OutlineBookPolicy;
  range: {from: number; to: number}; baseline: VolumePlanDocument | null;
}
const scope = new AsyncLocalStorage<OutlinePlanningState>();
export const currentOutlinePlanning = () => scope.getStore();
export async function readOutlinePlanningState(db: BindingDb, novelId: string, range = {from: 1, to: 1}): Promise<OutlinePlanningState | null> {
  const b = await db.outlineBookBinding.findUnique({where: {novelId}});
  if (!b) return null;
  const r = await db.outlineRevision.findFirst({where: {id: b.revisionId, projectId: b.projectId}});
  if (!r) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "找不到采用的大纲修订。");
  const document: OutlineDocument = JSON.parse(r.documentJson);
  if (outlineHash(document) !== b.sourceDocumentHash) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "采用的大纲来源校验不一致。");
  const version = await db.volumePlanVersion.findFirst({where: {novelId, status: "active"}, orderBy: {version: "desc"}});
  return {novelId, ref: {bindingId: b.id, revisionId: b.revisionId, sourceDocumentHash: b.sourceDocumentHash, policyVersion: b.policyVersion},
    document, mapping: JSON.parse(b.mappingJson), policy: JSON.parse(b.policyJson), range, baseline: version ? JSON.parse(version.contentJson) : null};
}
export async function assertOutlineReference(db: Pick<BindingDb, "outlineBookBinding">, novelId: string, ref: OutlineBindingRef) {
  const b = await db.outlineBookBinding.findUnique({where: {novelId}});
  if (!b || b.id !== ref.bindingId || b.revisionId !== ref.revisionId || b.sourceDocumentHash !== ref.sourceDocumentHash || b.policyVersion !== ref.policyVersion)
    throw new OutlineOpenBookError("OUTLINE_POLICY_CONFLICT", "大纲保留策略已变化，请重新准备本章。");
}
export function buildOutlinePlanningPayload(state: OutlinePlanningState) {
  const {document: d, mapping: m, range} = state;
  const slot = [...m.volumes, ...(m.runtimeVolumes ?? [])].find(v => range.from >= v.from && range.from <= v.to);
  const current = m.chapters.find(c => c.chapterOrder === range.from);
  const chapter = d.chapters.find(c => c.nodeId === current?.nodeId);
  const volume = d.volumes.find(v => v.nodeId === (slot && "nodeId" in slot ? slot.nodeId : undefined));
  const characters = d.characters.filter(c => chapter?.characterNodeIds.includes(c.nodeId) || c.appearanceNodeIds.some(id => id === chapter?.nodeId || id === volume?.nodeId));
  const payoffs = d.payoffs.filter(p => chapter?.payoffNodeIds.includes(p.nodeId) || [...p.setupChapterNodeIds, ...p.payoffChapterNodeIds].includes(chapter?.nodeId ?? ""));
  const relevant = new Set([d.story.nodeId, ...(volume ? [volume.nodeId] : []), ...(chapter ? [chapter.nodeId] : []), ...characters.map(c => c.nodeId), ...payoffs.map(p => p.nodeId)]);
  const facts = d.facts.filter(f => f.scope.type === "story" || f.scope.nodeId === volume?.nodeId || f.scope.nodeId === chapter?.nodeId);
  facts.forEach(f => relevant.add(f.nodeId));
  return {source: state.ref, planningNotActualFacts: true, story: d.story, facts, volume, chapter, characters, payoffs,
    slot, allowedRange: range, preservedFields: state.policy.rules.filter(r => relevant.has(r.nodeId)),
    futureDirections: d.volumes.filter(v => v.nodeId !== volume?.nodeId).map(v => ({nodeId: v.nodeId, title: v.title, summary: v.summary, endingHook: v.endingHook})),
    neighboringChapters: m.chapters.filter(c => Math.abs(c.chapterOrder-range.from) <= 1 && c.nodeId !== chapter?.nodeId).map(c => d.chapters.find(n => n.nodeId === c.nodeId))};
}
export function withOutlinePlanningState<T>(state: OutlinePlanningState, work: () => Promise<T>) {
  return scope.run(state, () => withRequiredPromptContext({key: `outline:${state.ref.bindingId}:${state.ref.policyVersion}`, value: buildOutlinePlanningPayload(state)}, work));
}
