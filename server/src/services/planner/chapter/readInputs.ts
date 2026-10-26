import type { ChapterPlanPreparationDependencies, GenerateChapterPlanOptions } from "./types";
import { plannerStoryModeSelect } from "./types";

export async function readChapterPlanInputs(novelId: string, chapterId: string, options: GenerateChapterPlanOptions, deps: ChapterPlanPreparationDependencies) {
  const [novel, chapter, bible, plotBeats, summaries, characters, bookPlan, arcPlans, volumePlans, recentAuditReports, recentDecisions, storyMacroPlanRow, styleEngine, pendingReviewProposalCount] = await Promise.all([
    deps.db.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        outline: true,
        structuredOutline: true,
        estimatedChapterCount: true,
        genre: { select: { name: true } },
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        styleTone: true,
        primaryStoryMode: { select: plannerStoryModeSelect },
        secondaryStoryMode: { select: plannerStoryModeSelect },
      },
    }),
    deps.db.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        title: true,
        order: true,
        expectation: true,
        content: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        hook: true,
        taskSheet: true,
        sceneCards: true,
        updatedAt: true,
      },
    }),
    deps.db.novelBible.findUnique({
      where: { novelId },
      select: { rawContent: true },
    }),
    deps.db.plotBeat.findMany({
      where: { novelId },
      orderBy: { chapterOrder: "asc" },
      take: 8,
    }),
    deps.db.chapterSummary.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    deps.db.character.findMany({
      where: { novelId },
      select: { id: true, name: true, role: true, currentGoal: true, currentState: true },
    }),
    deps.readBookPlan(novelId),
    deps.listArcPlans(novelId),
    deps.db.volumePlan.findMany({
      where: { novelId },
      orderBy: { sortOrder: "asc" },
      include: {
        chapters: {
          orderBy: { chapterOrder: "asc" },
        },
      },
    }),
    deps.db.auditReport.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        issues: {
          where: { status: "open" },
        },
      },
    }),
    deps.db.creativeDecision.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        category: true,
        content: true,
        importance: true,
      },
    }),
    deps.db.storyMacroPlan.findUnique({
      where: { novelId },
    }),
    deps.resolveStyleSummary(novelId, chapterId, options.taskStyleProfileId),
    deps.db.stateChangeProposal.count({
      where: {
        novelId,
        status: "pending_review",
      },
    }),
  ]);
  if (!novel || !chapter) {
    throw new Error("小说或章节不存在。");
  }

  return {novel,chapter,bible,plotBeats,summaries,characters,bookPlan,arcPlans,volumePlans,recentAuditReports,recentDecisions,storyMacroPlanRow,styleEngine,pendingReviewProposalCount};
}
