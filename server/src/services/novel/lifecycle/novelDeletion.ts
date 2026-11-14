import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { removeOwnedNovelImageFiles, type NovelImageFile } from "../../image/novelImageCleanup";
import { VectorStoreService } from "../../rag/VectorStoreService";

export interface NovelDeletionFiles {
  images: NovelImageFile[];
  vectorIds: string[];
}

// Run before deleting tasks: SetNull would otherwise erase the only ownership evidence.
export async function prepareNovelDeletion(tx: Prisma.TransactionClient, novelId: string) {
  const tasks = await tx.novelWorkflowTask.findMany({ where: { novelId }, select: { id: true } });
  const taskIds = tasks.map(row => row.id);
  const agents = await tx.agentRun.findMany({ where: { novelId }, select: { id: true } });
  const jobs = await tx.generationJob.findMany({ where: { novelId }, select: { id: true } });
  const chapters = await tx.chapter.findMany({ where: { novelId }, select: { id: true } });
  const chapterIds = chapters.map(row => row.id);
  const taskScope = { OR: [{ novelId }, { taskId: { in: taskIds } }] };
  await tx.structuredInvocationDiagnostic.deleteMany({ where: taskScope });
  await tx.llmInvocationUsageRecord.deleteMany({ where: { OR: [
    { novelId }, { workflowTaskId: { in: taskIds } },
    { generationJobId: { in: jobs.map(row => row.id) } },
    { runId: { in: agents.map(row => row.id) } }, { chapterId: { in: chapterIds } },
  ] } }); // Payload (compressed prompts and answers) cascades with the usage record.
  await tx.directorLlmUsageRecord.deleteMany({ where: taskScope });
  await tx.directorEvent.deleteMany({ where: taskScope });
  await tx.directorRunCommand.deleteMany({ where: taskScope });
  await tx.directorRun.deleteMany({ where: taskScope });
  await tx.creationStudioConfirmation.deleteMany({ where: { novelId } });

  const runtimeScope = { OR: [{ novelId }, { workflowTaskId: { in: taskIds } }] };
  // Child runtime rows cascade from the instance. Keep the legacy cleanup in the
  // deletion boundary while avoiding four independent legacy-table entry points.
  await tx.directorRuntimeInstance.deleteMany({ where: runtimeScope });
  await tx.directorNextArtifact.deleteMany({ where: { novelId } });
  await tx.directorNextRun.deleteMany({ where: { novelId } });
  await tx.characterConversationSession.deleteMany({ where: { scopeKind: "novel", scopeId: novelId } });
  await tx.storyTimelineEvent.deleteMany({ where: { novelId } });
  await tx.chapterTimeAnchor.deleteMany({ where: { novelId } });
  await tx.timelineHook.deleteMany({ where: { novelId } });
  await tx.timelineConstraint.deleteMany({ where: { novelId } });
  await tx.timelineCheckReport.deleteMany({ where: { novelId } });
  await tx.ragRetrievalTrace.deleteMany({ where: { novelId } });
  await tx.styleBinding.deleteMany({ where: { targetType: "novel", targetId: novelId } });
  await tx.knowledgeBinding.deleteMany({ where: { targetType: "novel", targetId: novelId } });

  const chunks = await tx.knowledgeChunk.findMany({ where: { novelId }, select: { id: true } });
  await tx.knowledgeChunk.deleteMany({ where: { novelId } });
  await tx.ragIndexJob.deleteMany({ where: { OR: [
    { ownerType: "novel", ownerId: novelId }, { ownerType: "bible", ownerId: novelId },
    { ownerType: "chapter", ownerId: { in: chapterIds } },
  ] } });

  const assets = await tx.imageAsset.findMany({
    where: { OR: [{ novelId }, { task: { novelId } }] },
    select: { id: true, url: true, metadata: true, taskId: true, sceneType: true, novelId: true, baseCharacterId: true, bookAnalysisCharacterId: true },
  });
  await tx.visualAssetProjection.deleteMany({ where: { OR: [
    { scopeKind: "novel", scopeId: novelId },
    { sourceDomain: "image_asset", sourceId: { in: assets.map(row => row.id) } },
  ] } });

  // Imported originals remain independent user assets; remove stale working-copy pointers.
  const projects = await tx.manuscriptProject.findMany({ where: { novelId }, select: { id: true } });
  const projectIds = projects.map(row => row.id);
  await tx.manuscriptUnit.updateMany({ where: { projectId: { in: projectIds } }, data: { chapterId: null, segmentId: null } });
  await tx.manuscriptImportSession.updateMany({ where: { createdNovelId: novelId }, data: { createdNovelId: null } });

  if (!assets.length && !chunks.length) return null;
  return tx.novelSideEffectJob.create({ data: {
    // Null is intentional: this retry receipt must survive deletion of the novel.
    novelId: null, jobType: "novel.deletedFiles", idempotencyKey: `novel.deletedFiles:${novelId}:${Date.now()}`,
    payloadJson: JSON.stringify({ images: assets, vectorIds: chunks.map(row => row.id) } satisfies NovelDeletionFiles),
  } });
}

export async function finishNovelDeletion(payload: NovelDeletionFiles): Promise<void> {
  await removeOwnedNovelImageFiles(payload.images);
  if (payload.vectorIds.length) {
    try { await new VectorStoreService().deletePoints(payload.vectorIds); }
    catch { /* The relational index rows are gone; stale remote vectors are not exposed by novel scope. */ }
  }
}
