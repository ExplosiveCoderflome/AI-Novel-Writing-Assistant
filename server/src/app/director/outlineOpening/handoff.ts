import type { RunContract } from "../../../modules/director";
import { prisma } from "../../../db/prisma";
import { readOutlinePlanningState, assertOutlineReference } from "../../../modules/planning/outline/constraints";
import { OutlineOpenBookError } from "../../../modules/planning/outline/openBook";
import { outlineOpeningPlan } from "./plan";
export async function prepareOutlineHandoff(contract: RunContract) {
  const input = contract.launchInput!;
  const state = await readOutlinePlanningState(prisma, contract.novelId, contract.chapterRange ?? {from: 1, to: 1});
  if (!state) {
    if (input.outlineBinding) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "本书没有对应的大纲来源。");
    return false;
  }
  if (input.outlineBinding) await assertOutlineReference(prisma, contract.novelId, input.outlineBinding);
  if (contract.chapterRange && contract.chapterRange.from !== contract.chapterRange.to)
    throw new OutlineOpenBookError("OUTLINE_SINGLE_CHAPTER_REQUIRED", "按大纲写作每次只确认一章，请选择当前章。", 422);
  const novel = await prisma.novel.findUniqueOrThrow({where: {id: contract.novelId}, select: {estimatedChapterCount: true, worldId: true}});
  if (contract.chapterRange && contract.chapterRange.to > (novel.estimatedChapterCount ?? 0)) throw new OutlineOpenBookError("OUTLINE_RANGE_INVALID", "章节超出确认的全书篇幅。", 422);
  if (contract.chapterRange?.from && contract.chapterRange.from > 1) {
    const previous = await prisma.chapter.findFirst({where: {novelId: contract.novelId, order: contract.chapterRange.from-1}, select: {content: true}});
    if (!previous?.content?.trim()) throw new OutlineOpenBookError("OUTLINE_PREVIOUS_CHAPTER_REQUIRED", "请完成前一章并核对正文，再准备下一章。", 422);
  }
  const targetSlot = [...state.mapping.volumes, ...(state.mapping.runtimeVolumes ?? [])].find(s => state.range.from >= s.from && state.range.from <= s.to);
  if (input.targetVolumeId && targetSlot && input.targetVolumeId !== targetSlot.volumeId) throw new OutlineOpenBookError("OUTLINE_RANGE_INVALID", "目标卷与确认的章节槽位不一致。", 422);
  input.outlineBinding = state.ref;
  input.storyInput = state.document.story.premise || state.document.story.synopsis;
  input.estimatedChapterCount = novel.estimatedChapterCount!;
  input.worldMode = novel.worldId ? "reuse" : input.worldMode;
  if (targetSlot) input.targetVolumeId = targetSlot.volumeId;
  contract.driver = "assisted";
  contract.planVersion = outlineOpeningPlan.version;
  return true;
}
