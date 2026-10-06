import type {DirectorConfirmRequest} from "@ai-novel/shared/types/novelDirector";
import {prisma} from "../../db/prisma";
import {NovelCoreService} from "../../services/novel/NovelCoreService";
import {getLLMSelectionSettings} from "../../services/settings/LLMSelectionSettingsService";
import {getDirectorProductionServices} from "./services";
import {AppError} from "../../middleware/errorHandler";
import {StyleBindingService} from "../../services/styleEngine/StyleBindingService";
import {assertNovelDirectorVersion} from "../../modules/novel/director-routing";

/** New-book handoff is an entry adapter; it creates no legacy director task. */
export async function launchNewDirectorBook(input: DirectorConfirmRequest, sourceTaskId: string, source: "creation_studio" | "original_opening" = "creation_studio") {
  const selection = await getLLMSelectionSettings();
  const provider = input.provider ?? selection?.provider, model = input.model ?? selection?.model;
  if (!provider || !model) throw new AppError("请先选择可用于创作的模型，再确认开书方向。",400);
  const confirmation = source === "creation_studio" ? await prisma.creationStudioConfirmation.findUniqueOrThrow({where:{workflowTaskId:sourceTaskId}}) : null;
  const reservedNovelId = confirmation ? confirmation.novelId ?? `director-book-${confirmation.id}` : `director-opening-book-${sourceTaskId}`;
  const existing = await prisma.novel.findUnique({where:{id:reservedNovelId}});
  if (existing?.directorVersion) await assertNovelDirectorVersion(existing.id, "v2", 0);
  const novel = existing ?? await new NovelCoreService().createNovel({id:reservedNovelId,title:input.title ?? input.candidate.workingTitle,description:input.description ?? input.candidate.logline,
      bookSellingPoint:input.bookSellingPoint,styleTone:input.styleTone,estimatedChapterCount:input.estimatedChapterCount,
      defaultChapterLength:input.defaultChapterLength,projectMode:input.projectMode,writingMode:input.writingMode,
      worldId:input.worldId,genreId:input.genreId,primaryStoryModeId:input.primaryStoryModeId,secondaryStoryModeId:input.secondaryStoryModeId,
      targetAudience:input.targetAudience,competingFeel:input.competingFeel,first30ChapterPromise:input.first30ChapterPromise,commercialTags:input.commercialTags,
      narrativePov:input.narrativePov,pacePreference:input.pacePreference,emotionIntensity:input.emotionIntensity,aiFreedom:input.aiFreedom,
      postGenerationStyleReviewEnabled:input.postGenerationStyleReviewEnabled,sourceNovelId:input.sourceNovelId,sourceKnowledgeDocumentId:input.sourceKnowledgeDocumentId,
      continuationBookAnalysisId:input.continuationBookAnalysisId,continuationBookAnalysisSections:input.continuationBookAnalysisSections,
      referenceBookAnalysisId:input.referenceBookAnalysisId,referenceBookAnalysisSections:input.referenceBookAnalysisSections});
  if (!existing?.directorVersion) await prisma.novel.update({where: {id: novel.id}, data: {directorVersion: "v2"}});
  await new StyleBindingService().ensureNovelDefault(novel.id, input.styleProfileId);
  if (confirmation && !confirmation.novelId) await prisma.creationStudioConfirmation.update({where:{workflowTaskId:sourceTaskId},data:{novelId:novel.id}});
  const chapterCount = input.estimatedChapterCount ?? input.candidate.targetChapterCount;
  const end = input.autoExecutionPlan?.endOrder ?? (input.runMode === "full_book_autopilot" ? chapterCount : undefined);
  const executionRange = source === "original_opening" && ["full_book_autopilot","auto_to_execution"].includes(input.runMode ?? "") && end
    ? {from:input.autoExecutionPlan?.startOrder ?? 1,to:end} : undefined;
  const result = await getDirectorProductionServices().http.commandService.execute({type:"open_run",novelId:novel.id,driver:source === "original_opening" && input.runMode !== "stage_review" ? "auto" : "assisted",stepIdsInScope:null,
    idempotencyKey:`${source === "creation_studio" ? "creation-studio" : source}:${sourceTaskId}:director`,launchInput:{storyInput:source === "original_opening" ? `${input.idea}\n\n已选定的开书方向：\n${JSON.stringify(input.candidate)}` : input.idea,estimatedChapterCount:chapterCount,
      worldMode:input.worldId ? "reuse" : input.worldSetupMode === "skip" ? "skip" : "generate",targetMode:"opening",provider,model,temperature:input.temperature ?? selection?.temperature,executionRange}});
  return {novel,workflowTaskId:result.runId};
}
