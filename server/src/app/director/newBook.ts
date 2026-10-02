import type {DirectorConfirmRequest} from "@ai-novel/shared/types/novelDirector";
import {prisma} from "../../db/prisma";
import {NovelCoreService} from "../../services/novel/NovelCoreService";
import {getLLMSelectionSettings} from "../../services/settings/LLMSelectionSettingsService";
import {getDirectorProductionServices} from "./services";
import {AppError} from "../../middleware/errorHandler";

/** New-book handoff is an entry adapter; it creates no legacy director task. */
export async function launchNewDirectorBook(input: DirectorConfirmRequest, sourceTaskId: string) {
  const selection = await getLLMSelectionSettings();
  const provider = input.provider ?? selection?.provider, model = input.model ?? selection?.model;
  if (!provider || !model) throw new AppError("请先选择可用于创作的模型，再确认开书方向。",400);
  const confirmation = await prisma.creationStudioConfirmation.findUniqueOrThrow({where:{workflowTaskId:sourceTaskId}});
  const reservedNovelId = confirmation.novelId ?? `director-book-${confirmation.id}`;
  const existing = await prisma.novel.findUnique({where:{id:reservedNovelId}});
  const novel = existing ?? await new NovelCoreService().createNovel({id:reservedNovelId,title:input.title ?? input.candidate.workingTitle,description:input.description ?? input.candidate.logline,
      bookSellingPoint:input.bookSellingPoint,styleTone:input.styleTone,estimatedChapterCount:input.estimatedChapterCount,
      defaultChapterLength:input.defaultChapterLength,projectMode:input.projectMode,writingMode:input.writingMode,
      worldId:input.worldId,genreId:input.genreId,primaryStoryModeId:input.primaryStoryModeId,secondaryStoryModeId:input.secondaryStoryModeId});
  if (!confirmation.novelId) await prisma.creationStudioConfirmation.update({where:{workflowTaskId:sourceTaskId},data:{novelId:novel.id}});
  const result = await getDirectorProductionServices().http.commandService.execute({type:"open_run",novelId:novel.id,driver:"assisted",stepIdsInScope:null,
    idempotencyKey:`creation-studio:${sourceTaskId}:director`,launchInput:{storyInput:input.idea,estimatedChapterCount:input.estimatedChapterCount ?? input.candidate.targetChapterCount,
      worldMode:input.worldId ? "reuse" : input.worldSetupMode === "skip" ? "skip" : "generate",targetMode:"opening",provider,model,temperature:input.temperature ?? selection?.temperature}});
  return {novel,workflowTaskId:result.runId};
}
