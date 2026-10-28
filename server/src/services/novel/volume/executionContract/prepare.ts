import { prisma } from "../../../../db/prisma";
import { inspectChapterExecutionContractReadiness } from "../chapterDetail/chapterExecutionContractReadiness";
import type { ChapterExecutionContractServiceDeps, ChapterContractPreparationPorts, EnsureChapterExecutionContractOptions } from "./types";
import { readWorkspaceFingerprint } from "./sourceVersion";
export async function prepareExecutionContract(novelId: string, chapterId: string,
  options: EnsureChapterExecutionContractOptions, deps: ChapterExecutionContractServiceDeps,
  ports?: ChapterContractPreparationPorts) {
  if (ports && [ports.readWorkspace, ports.generateDocument, ports.reviewContinuity, ports.resolveStyleContract]
    .some(port => typeof port !== "function")) throw new Error("Contract preparation requires explicit source and execution ports");
  const db = ports?.db ?? prisma;
  const workspaceFingerprint = ports ? await readWorkspaceFingerprint(db, novelId) : null;
    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        novelId: true,
        title: true,
        order: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
        content: true,
        expectation: true,
        chapterStatus: true,
        generationState: true,
        repairHistory: true,
        qualityScore: true,
        continuityScore: true,
        characterScore: true,
        pacingScore: true,
        riskFlags: true,
        hook: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }

    const workspace = await (ports ? ports.readWorkspace(novelId) : deps.ensureVolumeWorkspace(novelId));
    const matched = deps.findVolumeChapterMatch(workspace, {
      order: chapter.order,
      title: chapter.title,
    });
    const currentRequirement = workspace.volumes
      .find((volume) => volume.id === matched.volumeId)
      ?.chapters.find((item) => item.id === matched.volumeChapterId);
    const readiness = currentRequirement
      ? inspectChapterExecutionContractReadiness({
        novelId,
        volumeId: matched.volumeId,
        requirement: currentRequirement,
        persisted: chapter,
      })
      : null;

  const previous = readiness?.canReuse && currentRequirement && !chapter.content?.trim() && chapter.order > 1
    ? await db.chapter.findFirst({ where: { novelId, order: chapter.order - 1 }, select: { order: true, title: true, content: true } }) : null;
  const preparedStyleContract = ports ? await ports.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId) : null;
  if (ports && workspaceFingerprint !== await readWorkspaceFingerprint(db, novelId)) throw new Error("卷规划在准备期间发生变化，请重新准备本章。");
  return { novelId, chapterId, chapter, workspace, matched, currentRequirement: currentRequirement ?? null,
    readiness, previous, workspaceFingerprint, preparedStyleContract };
}
export type PreparedChapterExecutionContract = Awaited<ReturnType<typeof prepareExecutionContract>>;
