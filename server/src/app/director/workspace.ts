import {prisma} from "../../db/prisma";
import type {SimpleCreationShelfProjection,VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {readChapterQualityDebtDetails,hasChapterQualityLoopReplanRequiredRiskFlags} from "@ai-novel/shared/types/chapterQualityLoop";
import {normalizeVolumeWorkspaceDocument} from "../../services/novel/volume/volumeWorkspaceDocument";
import {AppError} from "../../middleware/errorHandler";
import {FactIntegrityError,PrismaRunRepository} from "../../modules/director";
import {resolveSavedReviewContexts,type SavedReviewContext} from "./projections/confirmationRoutes";
import {projectWorldMaterials,projectCharacterMaterials,savedStringList} from "./workspace/index";

/** Saved book display never reads task seeds or repairs compatibility records. */
export async function readDirectorWorkspace(novelId: string) {
  const novel = await prisma.novel.findUnique({where:{id:novelId},include:{world:true,novelWorld:true,bookContract:true,characters:{orderBy:{createdAt:"asc"}},chapters:{orderBy:{order:"asc"}},volumePlans:{where:{status:"active"},orderBy:{sortOrder:"asc"},include:{chapters:true}}}});
  if (!novel) throw new AppError("小说不存在。",404);
  const runs=new PrismaRunRepository();
  const runId=await runs.findActiveRunIdByNovel(novelId);
  const contract=runId ? await runs.getContract(runId) : null, control=runId ? await runs.getControl(runId) : null;
  let reviewContexts:SavedReviewContext[]=[],reviewContextError:string|null=null;
  try {if(contract && control) reviewContexts=await resolveSavedReviewContexts({contract,control});}
  catch(error) {if(!(error instanceof FactIntegrityError)) throw error;reviewContextError=error.message;}
  const version = await prisma.volumePlanVersion.findFirst({where:{novelId,status:"active"},orderBy:{version:"desc"}});
  const planning = normalizeVolumeWorkspaceDocument(novelId, version?.contentJson ?? {volumes:novel.volumePlans}, {activeVersionId:version?.id ?? null,source:novel.volumePlans.length ? "volume" : "empty"});
  const chapters: SimpleCreationShelfProjection["chapters"] = novel.chapters.map(chapter=>{
    const content=chapter.content?.trim() || null, qualityDebt=content ? readChapterQualityDebtDetails(chapter.riskFlags):null;
    const status: SimpleCreationShelfProjection["chapters"][number]["status"] = hasChapterQualityLoopReplanRequiredRiskFlags(chapter.riskFlags) ? "replan_required" : qualityDebt ? "quality_debt" : chapter.generationState === "approved" || chapter.generationState === "published" ? "completed" : chapter.chapterStatus === "generating" ? "generating" : chapter.chapterStatus === "needs_repair" || chapter.chapterStatus === "pending_review" ? "reviewing" : content ? "waiting_writing" : "waiting_planning";
    return {id:chapter.id,order:chapter.order,title:chapter.title,content,status,qualityDebt,wordCount:content ? Array.from(content).length:0,updatedAt:chapter.updatedAt.toISOString()};
  });
  return {novel:{id:novel.id,title:novel.title,creationExperience:novel.creationExperience,estimatedChapterCount:novel.estimatedChapterCount},chapters,planning,reviewContexts,reviewContextError,
    executionPlans:novel.chapters.map(({id,order,title,taskSheet,sceneCards,targetWordCount,mustAvoid})=>({id,order,title,taskSheet,sceneCards,targetWordCount,mustAvoid})),
    materials:{description:novel.description,characterCount:novel.characters.length,volumeCount:planning.volumes.length,openQualityDebtCount:chapters.filter(chapter=>chapter.qualityDebt).length,
      story:{coreSellingPoint:novel.bookContract?.coreSellingPoint ?? novel.bookSellingPoint,readingPromise:novel.bookContract?.readingPromise ?? novel.competingFeel,first30ChapterPromise:novel.first30ChapterPromise,protagonistFantasy:novel.bookContract?.protagonistFantasy ?? null,
        chapter3Payoff:novel.bookContract?.chapter3Payoff ?? null,chapter10Payoff:novel.bookContract?.chapter10Payoff ?? null,chapter30Payoff:novel.bookContract?.chapter30Payoff ?? null,
        escalationLadder:novel.bookContract?.escalationLadder ?? null,relationshipMainline:novel.bookContract?.relationshipMainline ?? null,absoluteRedLines:savedStringList(novel.bookContract?.absoluteRedLinesJson)},
      world:projectWorldMaterials(novelId,novel.novelWorld,novel.world,novel.storyWorldSliceJson),
      characters:novel.characters.map(projectCharacterMaterials),
      volumes:planning.volumes.map(volume=>({id:volume.id,order:volume.sortOrder,title:volume.title,summary:volume.summary ?? null,mainPromise:volume.mainPromise ?? null,chapterCount:volume.chapters.length}))}};
}
