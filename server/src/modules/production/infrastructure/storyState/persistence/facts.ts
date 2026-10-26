import { compact, type ConsumerWriter } from "./types";
import { hashProductionContent } from "../../../application";
import { buildChapterArtifactContentHash } from "../../../../../services/novel/runtime/artifactSync/ChapterArtifactContentVersion";

/** Only finalized AI facts, never the legacy text fact extractor. */
export function createFactsWriter(rag: { tenantId: string; maxAttempts: number } = { tenantId: "default", maxAttempts: 5 }): ConsumerWriter {
return async ({ tx, context, output }) => {
  const { novelId, chapterId, order } = context.run.progress.unit;
  const summary = compact(output.summary);
  const shortLines = (values: (string | null | undefined)[]) => [...new Set(values.map(compact).filter(Boolean))].slice(0, 3).join("；") || null;
  const data = { summary, keyEvents: shortLines(output.concreteFacts.filter(fact => fact.category !== "state_changed").map(fact => fact.text)),
    characterStates: shortLines(output.stateDeltas.characterStates.map(state => state.summary)) };
  await tx.chapter.update({ where: { id: chapterId }, data: { expectation: summary } });
  await tx.chapterSummary.upsert({ where: { chapterId }, create: { novelId, chapterId, ...data }, update: data });
  const existing = new Set((await tx.novelFactEntry.findMany({ where: { novelId, chapterOrder: order }, select: { text: true } })).map(row => row.text.trim()));
  let created = 0;
  for (const fact of output.concreteFacts) {
    const text = compact(fact.text);
    if (!text || existing.has(text)) continue;
    await tx.novelFactEntry.create({ data: { novelId, chapterOrder: order, text, category: fact.category, source: "auto" } });
    existing.add(text); created++;
  }
  // Existing fact/RAG readers need their normalized 24-character identity, separate from the kernel's exact-text hash.
  const identity = { novelId, chapterId, contentHash: buildChapterArtifactContentHash(context.content), artifactType: "artifact_delta_extraction:v1", syncMode: "production_kernel" };
  const projectionData = { status: "succeeded", sourceType: "chapter_artifact_delta", sourceStage: "production_kernel", metadataJson: JSON.stringify({ schemaVersion: 1, output }) };
  await tx.chapterArtifactSyncCheckpoint.upsert({ where: { novelId_chapterId_contentHash_artifactType_syncMode: identity }, create: { ...identity, ...projectionData }, update: projectionData });
  const ragJobIds: string[] = [];
  for (const ownerType of ["chapter", "chapter_summary"] as const) {
    const id = `kernel:${hashProductionContent(JSON.stringify({ runId: context.run.id, requestKey: context.requestKey, ownerType }))}`;
    await tx.ragIndexJob.upsert({ where: { id }, create: { id, tenantId: rag.tenantId, jobType: "upsert", ownerType, ownerId: chapterId,
      maxAttempts: rag.maxAttempts, payloadJson: JSON.stringify({ productionKernel: { runId: context.run.id, contentHash: context.contentHash } }) }, update: {} });
    ragJobIds.push(id);
  }
  return { concreteFactCount: created, ragJobIds };
};
}
