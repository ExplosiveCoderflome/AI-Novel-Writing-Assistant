import type { Prisma } from "@prisma/client";
import { persistActiveVolumeWorkspace } from "../volumeWorkspacePersistence";
import { serializeVolumeWorkspaceDocument } from "../volumeWorkspaceDocument";
import type { ChapterExecutionContractServiceDeps, ContractTransactionFence } from "./types";
import type { PreparedChapterExecutionContract } from "./prepare";
import type { EvaluatedChapterExecutionContract } from "./evaluate";
import { readWorkspaceFingerprint } from "./sourceVersion";
export async function commitExecutionContract(tx: Prisma.TransactionClient, prepared: PreparedChapterExecutionContract,
  outcome: EvaluatedChapterExecutionContract, deps: ChapterExecutionContractServiceDeps, assertTransaction?: ContractTransactionFence) {
  const { novelId, chapterId, chapter } = prepared;
  if (assertTransaction) {
    await assertTransaction(tx, "before");
    if (!prepared.workspaceFingerprint) throw new Error("Missing prepared workspace version");
    if (prepared.workspaceFingerprint !== await readWorkspaceFingerprint(tx, novelId)) throw new Error("卷规划在生成期间发生变化，请重新准备本章。");
    const locked = await tx.chapter.updateMany({where: {id: chapterId, novelId, content: chapter.content,
      updatedAt: new Date(chapter.updatedAt), taskSheet: chapter.taskSheet, sceneCards: chapter.sceneCards},
      data: {updatedAt: new Date(chapter.updatedAt)}});
    if (locked.count !== 1) throw new Error("本章正文或规划在生成期间发生变化，请重新准备本章。");
  }
  const { reviewedPrevious } = outcome;
  if (outcome.kind === "reuse") {
    if (reviewedPrevious) {
      const source = await tx.chapter.findFirst({where: {novelId, order: reviewedPrevious.order}, select: {content: true}});
      if (source?.content !== reviewedPrevious.content) throw new Error("前章正文在规划生成期间发生变化，请重新准备本章。");
    }
    await assertTransaction?.(tx, "after");
    return { ...chapter, createdAt: new Date(chapter.createdAt), updatedAt: new Date(chapter.updatedAt), styleContract: outcome.styleContract };
  }
  const { generatedDocument, targetChapter, taskSheet, sceneCards, styleContract } = outcome;
  const saved = await (async () => {
      const current = await tx.chapter.findFirst({ where: { id: chapterId, novelId }, select: { taskSheet: true, sceneCards: true } });
      if (current?.taskSheet !== chapter.taskSheet || current?.sceneCards !== chapter.sceneCards) throw new Error("本章规划在生成期间发生变化，已保留新修改，请重新准备本章。");
      if (reviewedPrevious) {
        const source = await tx.chapter.findFirst({ where: { novelId, order: reviewedPrevious.order }, select: { content: true } });
        if (source?.content !== reviewedPrevious.content) throw new Error("前章正文在规划生成期间发生变化，请重新准备本章。");
      }
      const { versionId } = await deps.ensureActiveVersionRecord(
        tx,
        novelId,
        generatedDocument,
        `刷新第${chapter.order}章执行合同。`,
      );
      const persistedDocument = {
        ...generatedDocument,
        activeVersionId: versionId,
        source: "volume" as const,
      };
      await tx.volumePlanVersion.update({
        where: { id: versionId },
        data: {
          contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
        },
      });
      await persistActiveVolumeWorkspace(tx, novelId, persistedDocument, versionId);
      const updatedChapter = await tx.chapter.update({
        where: { id: chapterId },
        data: {
          targetWordCount: targetChapter.targetWordCount ?? chapter.targetWordCount ?? null,
          conflictLevel: targetChapter.conflictLevel ?? chapter.conflictLevel ?? null,
          revealLevel: targetChapter.revealLevel ?? chapter.revealLevel ?? null,
          mustAvoid: targetChapter.mustAvoid ?? chapter.mustAvoid ?? null,
          taskSheet,
          sceneCards: sceneCards,
        },
      });
      return {
        ...updatedChapter,
        styleContract,
      };
  })();
  await assertTransaction?.(tx, "after");
  return saved;
}
