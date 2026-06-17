import { prisma } from "../../../../db/prisma";

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
    select: { id: true, content: true },
  });
  if (chapterRows.length === 0) {
    return;
  }
  // 仅重置尚未开写的章节。已写正文的章节必须完整保留——content、生成状态、
  // 以及派生的摘要 / 连续性事实 / 角色时间线都是后续章节续写所依赖的上下文，
  // 绝不能因为「回到节奏 / 拆章补齐细化」就被清空。
  const chapterIds = chapterRows
    .filter((chapter) => !(typeof chapter.content === "string" && chapter.content.trim().length > 0))
    .map((chapter) => chapter.id);
  if (chapterIds.length === 0) {
    return;
  }
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
