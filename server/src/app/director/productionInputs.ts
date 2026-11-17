import { currentOutlinePlanning } from "../../modules/planning/outline/constraints";
import { prisma } from "../../db/prisma";
import type { StepContext, RunContract } from "../../modules/director";
import { StoryMacroPlanService } from "../../services/novel/storyMacro/StoryMacroPlanService";
import type { DirectorBookContractPromptInput } from "../../prompting/prompts/novel/directorPlanning.prompts";
import type { VolumeChapterPlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import {directorChapterTokenLimitSchema} from "@ai-novel/shared/types/director/chapterBudget";
import { AppError } from "../../middleware/errorHandler";

export function requireLaunch(contract: RunContract) {
  const input = contract.launchInput;
  if (!input?.storyInput.trim() || !Number.isSafeInteger(input.estimatedChapterCount) || input.estimatedChapterCount < 1
    || !contract.modelConfig.route.trim() || contract.modelConfig.route === "default"
    || !contract.modelConfig.model.trim() || contract.modelConfig.model === "default") throw new Error("创作运行缺少故事、章数或模型快照。");
  if (contract.chapterRange && (contract.chapterRange.from < 1 || contract.chapterRange.to < contract.chapterRange.from
    || contract.chapterRange.to > input.estimatedChapterCount)) throw new Error("正文授权范围与目标章节数不一致。");
  if (input.chapterTokenLimit !== undefined) directorChapterTokenLimitSchema.parse(input.chapterTokenLimit);
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
  const from = context.contract.chapterRange?.from ?? (input.outlineBinding ? 1 : undefined);
  const state = currentOutlinePlanning();
  const slot = state && [...state.mapping.volumes, ...(state.mapping.runtimeVolumes ?? [])].find(s => from != null && from >= s.from && from <= s.to);
  if (slot) return slot.volumeId;
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
  if (!range) throw new AppError("准备正文需要明确章节授权范围。", 400);
  if (range.from !== range.to) throw new AppError("按大纲写作每次只确认一章，请选择当前章。", 422);
  const matches = workspace.volumes.flatMap(volume => volume.chapters.filter(chapter => chapter.chapterOrder === range.from)
    .map(chapter => ({volumeId: volume.id, chapterId: chapter.id})));
  if (matches.length !== 1) throw new Error("授权起始章节缺少唯一的章节路线。");
  return {targets: matches, executionRange: {startOrder: range.from, endOrder: range.from}};
}

type SavedChapterPlanFields = Pick<VolumeChapterPlan, "id" | "volumeId" | "chapterOrder" | "taskSheet" | "sceneCards" | "targetWordCount" | "mustAvoid">;

/** Use saved task and scene fields for one chapter, retaining the rest of the version. */
export function applySavedChapterPlanFields(workspace: VolumePlanDocument, saved: SavedChapterPlanFields): VolumePlanDocument {
  const {id, volumeId, chapterOrder, taskSheet, sceneCards, targetWordCount, mustAvoid} = saved;
  return {...workspace, volumes: workspace.volumes.map(volume => volume.id !== volumeId ? volume : {
    ...volume, chapters: volume.chapters.map(chapter => chapter.id === id && chapter.chapterOrder === chapterOrder
      ? {...chapter, taskSheet, sceneCards, targetWordCount, mustAvoid} : chapter),
  })};
}

export async function readExecutionWindow(context: StepContext, workspace: VolumePlanDocument) {
  const {targets: [target], executionRange} = executionWindow(context, workspace);
  const {novelId, launchInput} = context.contract;
  const rows = await prisma.volumeChapterPlan.findMany({where: {volume: {novelId, status:"active"}, chapterOrder: executionRange.startOrder}});
  const [saved] = rows;
  if (rows.length !== 1 || saved.id !== target.chapterId || saved.volumeId !== target.volumeId
    || (launchInput?.targetVolumeId && saved.volumeId !== launchInput.targetVolumeId)) {
    throw new AppError(`无法定位第 ${executionRange.startOrder} 章的已保存计划，请重新读取本书。`, 409);
  }
  return {workspace: applySavedChapterPlanFields(workspace, saved), executionRange};
}
