import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import type { CommandServiceDeps } from "../../../modules/director/application";
import { manualChapterSyncService } from "../../../services/novel/chapterEditor/synchronization";
import { ChapterArtifactSyncBoundaryError } from "../../../services/novel/runtime/artifactSync";

/** Slow asset work belongs before the short gate transaction; the transaction still revalidates the result. */
export const prepareEditedChapterGate: NonNullable<CommandServiceDeps["prepareGate"]> = async (contract, resolution) => {
  if (resolution.decision === "regenerate" || !resolution.artifacts.some(row => row.type === "chapter_batch_closed")) return;
  const range = contract.chapterRange;
  if (!range) throw new AppError("缺少正文授权范围。", 400);
  const chapters = await prisma.chapter.findMany({ where: { novelId: contract.novelId,
    order: { gte: range.from, lte: range.to } }, orderBy: { order: "asc" }, select: { id: true } });
  for (const chapter of chapters) {
    try { await manualChapterSyncService.ensureCurrent(contract.novelId, chapter.id); }
    catch (error) {
      if (error instanceof ChapterArtifactSyncBoundaryError) throw new AppError(error.message, 409);
      throw error;
    }
  }
};
