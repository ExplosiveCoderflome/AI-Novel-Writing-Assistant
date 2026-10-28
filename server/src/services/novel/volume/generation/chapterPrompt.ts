import type {Prisma} from "@prisma/client";
import type {VolumePlan,VolumePlanDocument} from "@ai-novel/shared/types/novel";
import type {StoryMacroPlanService} from "../../storyMacro/StoryMacroPlanService";
import type {VolumeGenerateOptions,VolumeGenerationNovel,VolumeWorkspace} from "../volumeModels";
import {getBeatSheet} from "../volumeGenerationHelpers";
export async function prepareChapterDetailPrompt(params:{document:VolumePlanDocument;novel:VolumeGenerationNovel;workspace:VolumeWorkspace;
  storyMacroPlan:Awaited<ReturnType<StoryMacroPlanService["getPlan"]>>|null;options:VolumeGenerateOptions;
  targetVolume:VolumePlan;targetChapter:VolumePlan["chapters"][number];detailMode:"purpose"|"boundary"|"task_sheet";
  db:Pick<Prisma.TransactionClient,"chapter"|"chapterSummary">}) {
  const {document,novel,workspace,storyMacroPlan,options,targetVolume,targetChapter,detailMode,db}=params;
  const previous = detailMode === "task_sheet" && targetChapter.chapterOrder > 1 ? await db.chapter.findFirst({
    where: {novelId: document.novelId, order: {lt: targetChapter.chapterOrder}, content: {not: null}},
    orderBy: {order: "desc"}, select: {id: true, order: true, title: true, content: true},
  }) : null;
  const previousSummary = previous?.content?.trim() ? await db.chapterSummary.findFirst({
    where: {novelId: document.novelId, chapterId: previous.id}, orderBy: {updatedAt: "desc"}, select: {summary: true},
  }) : null;
  const previousChapterResult = previous?.content?.trim() ? {
    chapterOrder: previous.order, title: previous.title, summary: previousSummary?.summary ?? "",
    tail: previous.content.slice(-800), content: previous.content,
  } : null;
  return {
    novel,
    workspace,
    storyMacroPlan,
    strategyPlan: document.strategyPlan,
    targetVolume,
    targetBeatSheet: getBeatSheet(document, targetVolume.id),
    targetChapter,
    previousChapterResult,
    guidance: options.guidance,
    detailMode,
  };
}
