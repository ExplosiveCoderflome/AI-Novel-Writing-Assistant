import { prisma } from "../../db/prisma";
import type { StepContext, RunContract } from "../../modules/director";
import { StoryMacroPlanService } from "../../services/novel/storyMacro/StoryMacroPlanService";
import type { DirectorBookContractPromptInput } from "../../prompting/prompts/novel/directorPlanning.prompts";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";

export function requireLaunch(contract: RunContract) {
  const input = contract.launchInput;
  if (!input?.storyInput.trim() || !Number.isSafeInteger(input.estimatedChapterCount) || input.estimatedChapterCount < 1
    || !contract.modelConfig.route.trim() || contract.modelConfig.route === "default"
    || !contract.modelConfig.model.trim() || contract.modelConfig.model === "default") throw new Error("创作运行缺少故事、章数或模型快照。");
  if (contract.chapterRange && (contract.chapterRange.from < 1 || contract.chapterRange.to < contract.chapterRange.from
    || contract.chapterRange.to > input.estimatedChapterCount)) throw new Error("正文授权范围与目标章节数不一致。");
  return input;
}
export function modelOptions(context: StepContext) {
  const input = requireLaunch(context.contract);
  return {provider: context.contract.modelConfig.route, model: context.contract.modelConfig.model, temperature: input.temperature};
}
export async function bookContractInput(context: StepContext, macroService: StoryMacroPlanService): Promise<DirectorBookContractPromptInput> {
  const input = requireLaunch(context.contract);
  const novel = await prisma.novel.findUniqueOrThrow({where: {id: context.contract.novelId}});
  const macro = await macroService.getPlan(novel.id);
  if (!macro?.decomposition) throw new Error("缺少已保存的故事宏观规划。");
  const decomposition = macro.decomposition;
  return {idea: input.storyInput, targetChapterCount: input.estimatedChapterCount, storyMacroPlan: macro,
    context: {title: novel.title, description: novel.description ?? undefined, targetAudience: novel.targetAudience ?? undefined,
      bookSellingPoint: novel.bookSellingPoint ?? undefined, genreId: novel.genreId ?? undefined, estimatedChapterCount: input.estimatedChapterCount},
    // Only project already-structured story output. No legacy task seed or invented creative judgment.
    candidate: {id: novel.id, workingTitle: novel.title, logline: input.storyInput, positioning: novel.targetAudience ?? "",
      sellingPoint: decomposition.selling_point, coreConflict: decomposition.core_conflict, protagonistPath: decomposition.growth_path,
      endingDirection: decomposition.ending_flavor, hookStrategy: decomposition.main_hook, progressionLoop: decomposition.progression_loop,
      whyItFits: "", toneKeywords: [], targetChapterCount: input.estimatedChapterCount}};
}

export function findTargetVolume(context: Pick<StepContext,"contract">, workspace: VolumePlanDocument): string | null {
  const input = requireLaunch(context.contract);
  if (input.targetVolumeId) {
    if (!workspace.volumes.some(volume => volume.id === input.targetVolumeId)) throw new Error("指定卷不属于当前小说。");
    return input.targetVolumeId;
  }
  if (input.targetMode !== "opening") throw new Error("启动创作需要明确选择开篇或目标卷。");
  const from = context.contract.chapterRange?.from;
  const match = from ? workspace.volumes.find(volume => volume.chapters.some(chapter => chapter.chapterOrder === from)) : null;
  if (match) return match.id;
  // Fresh book opening follows the explicit sort order produced by the AI volume strategy.
  if (from == null || from === 1) {
    const opening = [...workspace.volumes].sort((a,b) => a.sortOrder-b.sortOrder)[0];
    if (opening) return opening.id;
  }
  return null;
}

export function targetVolume(context: Pick<StepContext,"contract">, workspace: VolumePlanDocument): string {
  const target = findTargetVolume(context, workspace);
  if (!target) throw new Error("授权章节尚未对应到卷，请先准备目标卷路线。");
  return target;
}
export function executionWindow(context: StepContext, workspace: VolumePlanDocument) {
  const range = context.contract.chapterRange;
  if (!range) throw new Error("准备正文需要明确章节授权范围。");
  const matches = workspace.volumes.flatMap(volume => volume.chapters.filter(chapter => chapter.chapterOrder === range.from)
    .map(chapter => ({volumeId: volume.id, chapterId: chapter.id})));
  if (matches.length !== 1) throw new Error("授权起始章节缺少唯一的章节路线。");
  return {targets: matches, executionRange: {startOrder: range.from, endOrder: range.from}};
}
