import {hashProductionContent} from "../../modules/production";
import {outlineOpenBookService} from "../../modules/planning/outline";
import {StoryMacroPlanService} from "../../services/novel/storyMacro/StoryMacroPlanService";
import {prisma} from "../../db/prisma";
import type {SimpleCreationShelfProjection,VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {readChapterQualityDebtDetails,hasChapterQualityLoopReplanRequiredRiskFlags} from "@ai-novel/shared/types/chapterQualityLoop";
import {normalizeVolumeWorkspaceDocument} from "../../services/novel/volume/volumeWorkspaceDocument";
import {AppError} from "../../middleware/errorHandler";
import {FactIntegrityError,PrismaRunRepository, type RunContract} from "../../modules/director";
import {readRunExecutionEpoch} from "../../modules/novel/director-routing";
import {MANUAL_CHAPTER_PLAN_VERSION} from "./productionKernel/manual/contract";
import {resolveSavedReviewContexts,type SavedReviewContext} from "./projections/confirmationRoutes";
import {canApproveProse,chapterApprovalFingerprint} from "./revisions/chapterReview";
import {applySavedChapterPlanFields} from "./productionInputs";
import {projectWorldMaterials,projectCharacterMaterials,savedStringList} from "./workspace/index";
import {directorVolumeChapterPlanFilter} from "./planning";
import { readActiveManuscriptChapters } from "../../modules/novel/manuscript/application/ManuscriptIsolation";
import { readNovelBookDirector } from "../../services/novel/catalog";
import { projectBookCompletion, readBookCompletionActivity } from "../../services/novel/production/completion";
import { readCharacterForwardPlanNotices } from "../../services/novel/characters/forwardAdjustments/plans";
export {readDirectorLedgers} from "./workspace/index";

/** Saved book display never reads task seeds or repairs compatibility records. */
export async function readDirectorWorkspace(novelId: string) {
  const novel = await prisma.novel.findUnique({where:{id:novelId},include:{storyMacroPlan:{select:{storyInput:true}},world:true,novelWorld:true,bookContract:true,manuscriptProject:{select:{id:true}},characters:{orderBy:{createdAt:"asc"}},chapters:{orderBy:{order:"asc"}},volumePlans:{where:directorVolumeChapterPlanFilter(novelId),orderBy:{sortOrder:"asc"},include:{chapters:true}}}});
  if (!novel) throw new AppError("小说不存在。",404);
  const [activeChapters, bookDirector, characterForwardPlanNotices] = await Promise.all([
    novel.manuscriptProject ? readActiveManuscriptChapters(prisma, novelId) : null,
    novel.estimatedChapterCount ? readNovelBookDirector(novel) : null,
    readCharacterForwardPlanNotices(prisma, novelId),
  ]);
  const effectiveChapters: typeof novel.chapters = activeChapters ?? novel.chapters;
  const bookCompletion = novel.narrativeForm === "short_story" ? null : projectBookCompletion({
    finalReviewNovelId: !novel.manuscriptProject && (novel.directorVersion==="v2" || bookDirector) ? novelId : undefined,
    target: activeChapters?.length ?? novel.estimatedChapterCount,
    chapters: effectiveChapters,
    activity: readBookCompletionActivity(bookDirector?.status),
  });
  const bindingRow=await prisma.outlineBookBinding.findUnique({where:{novelId},select:{projectId:true}});
  const outlineBinding=bindingRow ? await outlineOpenBookService.getBinding(bindingRow.projectId) : null;
  const runs=new PrismaRunRepository();
  const runId=await runs.findActiveRunIdByNovel(novelId);
  const contract=runId ? await runs.getContract(runId) : null, control=runId ? await runs.getControl(runId) : null;
  let continuationRun = contract?.runId === bookDirector?.runId ? contract : null;
  if (bookDirector && (!continuationRun || continuationRun.planVersion === MANUAL_CHAPTER_PLAN_VERSION)) {
    const latest = await prisma.directorNextRun.findFirst({
      where: {novelId, planVersion: {not: MANUAL_CHAPTER_PLAN_VERSION}}, orderBy: [{createdAt: "desc"}, {id: "desc"}],
      select: {contractJson: true},
    });
    continuationRun = latest && readRunExecutionEpoch(latest.contractJson) === novel.directorEpoch
      ? JSON.parse(latest.contractJson) as RunContract : null;
  }
  const continuationStoryInput = continuationRun?.launchInput?.storyInput ?? novel.storyMacroPlan?.storyInput ?? novel.description;
  let reviewContexts:SavedReviewContext[]=[],reviewContextError:string|null=null;
  try {if(contract && control) reviewContexts=await resolveSavedReviewContexts({contract,control});}
  catch(error) {if(!(error instanceof FactIntegrityError)) throw error;reviewContextError=error.message;}
  const version = await prisma.volumePlanVersion.findFirst({where:{novelId,status:"active"},orderBy:{version:"desc"}});
  const saved = normalizeVolumeWorkspaceDocument(novelId, version?.contentJson ?? {volumes:novel.volumePlans}, {activeVersionId:version?.id ?? null,source:novel.volumePlans.length ? "volume" : "empty"});
  // A serialized document may still identify the version from which it was copied.
  saved.activeVersionId = version?.id ?? null;
  const taskSheet = reviewContexts.find(context => context.type === "chapter_task_sheet");
  const savedPlans = taskSheet ? novel.volumePlans.flatMap(volume => volume.chapters)
    .filter(chapter => chapter.chapterOrder >= taskSheet.from! && chapter.chapterOrder <= taskSheet.to!) : [];
  const planning = savedPlans.reduce(applySavedChapterPlanFields, saved);
  const chapterReviewFingerprint = contract && taskSheet && version && canApproveProse(contract) ? chapterApprovalFingerprint(version.id,savedPlans) : undefined;
  const batch = reviewContexts.find(context => context.type === "chapter_batch_closed");
  const proseReviewHashes = batch ? Object.fromEntries(effectiveChapters.filter(row => row.order >= batch.from! && row.order <= batch.to! && row.content?.trim())
    .map(row => [row.id,hashProductionContent(row.content!)])) : undefined;
  const chapters: SimpleCreationShelfProjection["chapters"] = effectiveChapters.map(chapter=>{
    const trimmedContent = chapter.content?.trim() || null;
    const content = proseReviewHashes?.[chapter.id] ? chapter.content : trimmedContent;
    const qualityDebt = content ? readChapterQualityDebtDetails(chapter.riskFlags) : null;
    const status: SimpleCreationShelfProjection["chapters"][number]["status"] = hasChapterQualityLoopReplanRequiredRiskFlags(chapter.riskFlags) ? "replan_required" : qualityDebt ? "quality_debt" : chapter.generationState === "approved" || chapter.generationState === "published" ? "completed" : chapter.chapterStatus === "generating" ? "generating" : chapter.chapterStatus === "needs_repair" || chapter.chapterStatus === "pending_review" ? "reviewing" : content ? "waiting_writing" : "waiting_planning";
    return {id:chapter.id,order:chapter.order,title:chapter.title,content,status,qualityDebt,wordCount:trimmedContent ? Array.from(trimmedContent).length:0,updatedAt:chapter.updatedAt.toISOString()};
  });
  const outlinePreparation=outlineBinding ? {storyMacro:await new StoryMacroPlanService().getPlan(novelId),hasBookContract:Boolean(novel.bookContract),worldMode:contract?.launchInput?.worldMode} : undefined;
  return {continuationStoryInput,...(outlineBinding ? {outlineBinding,outlinePreparation} : {}),novel:{id:novel.id,title:novel.title,creationExperience:novel.creationExperience,estimatedChapterCount:novel.estimatedChapterCount},chapters,bookCompletion,planning,reviewContexts,proseReviewHashes,chapterReviewFingerprint,reviewContextError,characterForwardPlanNotices,
    executionPlans:effectiveChapters.map(({id,order,title,taskSheet,sceneCards,targetWordCount,mustAvoid})=>({id,order,title,taskSheet,sceneCards,targetWordCount,mustAvoid})),
    materials:{description:novel.description,characterCount:novel.characters.length,volumeCount:planning.volumes.length,openQualityDebtCount:chapters.filter(chapter=>chapter.qualityDebt).length,
      story:{coreSellingPoint:novel.bookContract?.coreSellingPoint ?? novel.bookSellingPoint,readingPromise:novel.bookContract?.readingPromise ?? novel.competingFeel,first30ChapterPromise:novel.first30ChapterPromise,protagonistFantasy:novel.bookContract?.protagonistFantasy ?? null,
        chapter3Payoff:novel.bookContract?.chapter3Payoff ?? null,chapter10Payoff:novel.bookContract?.chapter10Payoff ?? null,chapter30Payoff:novel.bookContract?.chapter30Payoff ?? null,
        escalationLadder:novel.bookContract?.escalationLadder ?? null,relationshipMainline:novel.bookContract?.relationshipMainline ?? null,absoluteRedLines:savedStringList(novel.bookContract?.absoluteRedLinesJson)},
      world:projectWorldMaterials(novelId,novel.novelWorld,novel.world,novel.storyWorldSliceJson),
      characters:novel.characters.map(projectCharacterMaterials),
      volumes:planning.volumes.map(volume=>({id:volume.id,order:volume.sortOrder,title:volume.title,summary:volume.summary ?? null,mainPromise:volume.mainPromise ?? null,chapterCount:volume.chapters.length}))}};
}
