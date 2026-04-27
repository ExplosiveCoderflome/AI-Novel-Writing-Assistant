import { prisma } from "../../../db/prisma";

export async function resetDirectorDownstreamChapterState(
  novelId: string,
  range: { startOrder: number; endOrder: number } | null,
): Promise<void> {
  if (!range) {
    return;
  }
  const chapterRows = await prisma.chapter.findMany({
    where: {
      novelId,
      order: {
        gte: range.startOrder,
        lte: range.endOrder,
      },
    },
    select: { id: true },
  });
  if (chapterRows.length === 0) {
    return;
  }
  const chapterIds = chapterRows.map((chapter) => chapter.id);
  await prisma.$transaction(async (tx) => {
    await tx.chapter.updateMany({
      where: { id: { in: chapterIds } },
      data: {
        content: "",
        generationState: "planned",
        chapterStatus: "unplanned",
        repairHistory: null,
        qualityScore: null,
        continuityScore: null,
        characterScore: null,
        pacingScore: null,
        riskFlags: null,
        hook: null,
      },
    });
    await tx.chapterSummary.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.consistencyFact.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterTimeline.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterCandidate.deleteMany({ where: { novelId, sourceChapterId: { in: chapterIds } } });
    await tx.characterFactionTrack.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterRelationStage.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.qualityReport.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.auditReport.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.stateChangeProposal.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.openConflict.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.storyStateSnapshot.deleteMany({ where: { novelId, sourceChapterId: { in: chapterIds } } });
  });
}
