import { z } from "zod";

const ids = z.array(z.string().min(1));
const depth = z.enum(["rough", "detailed"]);
export const outlineDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  story: z.object({ nodeId: z.string().min(1), title: z.string(), premise: z.string(), synopsis: z.string(), theme: z.string(), tone: z.string(), endingDirection: z.string(), targetAudience: z.string().optional(), genre: z.string().optional(), notes: z.string().optional() }),
  volumes: z.array(z.object({ nodeId: z.string().min(1), title: z.string(), order: z.number().int(), planningDepth: depth, summary: z.string(), promise: z.string().optional(), pressure: z.string().optional(), protagonistChange: z.string().optional(), climax: z.string().optional(), endingHook: z.string().optional(), chapterNodeIds: ids })),
  chapters: z.array(z.object({ nodeId: z.string().min(1), volumeNodeId: z.string().min(1), title: z.string(), order: z.number().int(), planningDepth: depth, summary: z.string(), purpose: z.string().optional(), conflict: z.string().optional(), emotionalBeat: z.string().optional(), endingHook: z.string().optional(), characterNodeIds: ids, payoffNodeIds: ids })),
  characters: z.array(z.object({ nodeId: z.string().min(1), name: z.string(), role: z.string().optional(), goal: z.string().optional(), motivation: z.string().optional(), conflict: z.string().optional(), secret: z.string().optional(), arcDirection: z.string().optional(), appearanceNodeIds: ids })),
  payoffs: z.array(z.object({ nodeId: z.string().min(1), title: z.string(), kind: z.enum(["foreshadowing", "hook", "promise", "mystery", "other"]), setupDescription: z.string(), payoffDescription: z.string(), setupChapterNodeIds: ids, payoffChapterNodeIds: ids, relatedNodeIds: ids })),
  facts: z.array(z.object({ nodeId: z.string().min(1), title: z.string(), content: z.string(), category: z.string().optional(), scope: z.object({ type: z.enum(["story", "volume", "chapter"]), nodeId: z.string().optional() }), relatedNodeIds: ids, immutable: z.boolean() })),
});
export type OutlineDocument = z.infer<typeof outlineDocumentSchema>;
export function validateOutlineDocument(value: unknown): OutlineDocument {
  const document = outlineDocumentSchema.parse(value);
  const nodeIds = [document.story.nodeId, ...document.volumes.map(x=>x.nodeId), ...document.chapters.map(x=>x.nodeId), ...document.characters.map(x=>x.nodeId), ...document.payoffs.map(x=>x.nodeId), ...document.facts.map(x=>x.nodeId)];
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error("大纲节点 ID 必须唯一");
  const known = new Set(nodeIds);
  const check = (id: string) => { if (!known.has(id)) throw new Error(`大纲引用不存在的节点：${id}`); };
  for (const volume of document.volumes) volume.chapterNodeIds.forEach(check);
  for (const chapter of document.chapters) { check(chapter.volumeNodeId); chapter.characterNodeIds.forEach(check); chapter.payoffNodeIds.forEach(check); }
  for (const character of document.characters) character.appearanceNodeIds.forEach(check);
  for (const payoff of document.payoffs) [...payoff.setupChapterNodeIds, ...payoff.payoffChapterNodeIds, ...payoff.relatedNodeIds].forEach(check);
  for (const fact of document.facts) { fact.relatedNodeIds.forEach(check); if (fact.scope.nodeId) check(fact.scope.nodeId); }
  return document;
}
export function createEmptyOutlineDocument(title = "未命名大纲"): OutlineDocument {
  return { schemaVersion: 1, story: { nodeId: crypto.randomUUID(), title, premise: "", synopsis: "", theme: "", tone: "", endingDirection: "" }, volumes: [], chapters: [], characters: [], payoffs: [], facts: [] };
}
