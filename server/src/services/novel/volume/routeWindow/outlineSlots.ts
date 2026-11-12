import { randomUUID } from "node:crypto";
import type { VolumePlanDocument, VolumeBeat } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../../db/prisma";
import { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../NovelVolumeService";
import type { ChapterRouteWindowOptions, ChapterRouteWindowResult } from "../../planning/ChapterRouteWindowService";
import { buildVolumeWorkspaceDocument } from "../volumeWorkspaceDocument";
import { loadGenerationContext } from "../generation";
import { getBeatExpectedChapterCount } from "../volumeGenerationHelpers";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { createVolumeChapterListPrompt } from "../../../../prompting/prompts/novel/volume/chapterList.prompts";
import { buildVolumeChapterListContextBlocks } from "../../../../prompting/prompts/novel/volume/contextBlocks";
import { assertOutlineReference, withOutlinePlanningState, type OutlinePlanningState } from "../../../../modules/planning/outline/constraints";
import { OutlineOpenBookError } from "../../../../modules/planning/outline/openBook/domain/errors";

export function findOutlineSlot(state: OutlinePlanningState, order: number) {
  return [...state.mapping.volumes, ...(state.mapping.runtimeVolumes ?? [])].find(s => order >= s.from && order <= s.to);
}
export function appendOutlineSlot(workspace: VolumePlanDocument, volumeId: string, order: number,
  proposed: {title: string; summary: string; beatKey: string; plannedCharacterIds?: string[]}, state: OutlinePlanningState) {
  const slot = findOutlineSlot(state, order);
  if (!slot || slot.volumeId !== volumeId || order < state.range.from || order > state.range.to) throw new OutlineOpenBookError("OUTLINE_SLOT_CONFLICT", "候选章节超出确认的篇幅槽位。");
  if (workspace.volumes.some(v => v.chapters.some(c => c.chapterOrder === order))) throw new OutlineOpenBookError("OUTLINE_SLOT_CONFLICT", "章槽已有规划，不能重新追加。");
  const time = new Date(0).toISOString();
  return buildVolumeWorkspaceDocument({...workspace, volumes: workspace.volumes.map(v => v.id !== volumeId ? v : {...v, status: "chapter_list_partial", chapters: [...v.chapters,
    {id: randomUUID(), volumeId, chapterOrder: order, ...proposed, payoffRefs: [], createdAt: time, updatedAt: time}].sort((a,b) => a.chapterOrder-b.chapterOrder)})});
}
/** Typed one-slot generation reuses the registered chapter-list prompt, but never merges a full-volume candidate. */
export async function ensureOutlineRouteWindow(novelId: string, from: number, options: ChapterRouteWindowOptions,
  service: NovelVolumeService, state: OutlinePlanningState): Promise<ChapterRouteWindowResult> {
  return withOutlinePlanningState(state, async () => {
    if (from !== state.range.from || state.range.to !== from) throw new OutlineOpenBookError("OUTLINE_SINGLE_CHAPTER_REQUIRED", "请逐章准备路线。", 422);
    let workspace = await service.getVolumes(novelId, {hydrateCanonical: false});
    const existing = workspace.volumes.flatMap(v => v.chapters).filter(c => c.chapterOrder === from);
    if (existing.length > 1) throw new Error("本章存在重复路线。");
    if (existing.length) {
      await service.appendMissingRoutes(novelId, workspace);
      return {availableRouteCount: 1, extended: false};
    }
    const slot = findOutlineSlot(state, from);
    const volume = workspace.volumes.find(v => v.id === slot?.volumeId);
    const sheet = workspace.beatSheets.find(s => s.volumeId === volume?.id);
    if (!volume || !slot || !sheet?.beats.length) throw new Error("请先确认当前卷的篇幅与节奏安排。");
    let relativeEnd = 0;
    const beat = sheet.beats.find(b => {relativeEnd += Math.max(1, getBeatExpectedChapterCount(b));return from-slot.from+1 <= relativeEnd;}) ?? sheet.beats.at(-1)!;
    const {novel, storyMacroPlan} = await loadGenerationContext({novelId, workspace, storyMacroPlanService: new StoryMacroPlanService()});
    const promptInput = {novel, workspace, storyMacroPlan, strategyPlan: workspace.strategyPlan, targetVolume: volume,
      targetBeatSheet: sheet, targetBeat: beat, targetBeatChapterCount: 1, targetChapterStartOrder: from-slot.from+1,
      targetChapterEndOrder: from-slot.from+1, nextAvailableChapterOrder: from-slot.from+1,
      chapterSlots: [{volumeId: volume.id, chapterOrder: from}],
      reservedChapterTitles: workspace.volumes.flatMap(v => v.chapters.map(c => c.title))};
    const generated = await runStructuredPrompt({asset: createVolumeChapterListPrompt({targetChapterCount: 1, targetBeatKey: beat.key,
      targetBeatLabel: beat.label, characterIds: novel.characters.map(c => c.id!)}), promptInput,
      contextBlocks: buildVolumeChapterListContextBlocks(promptInput), options: {...options, novelId, volumeId: volume.id, taskId: options.taskId, entrypoint: "director_next", scope: "outline_slot"}});
    await assertOutlineReference(prisma, novelId, state.ref);
    if (generated.output.chapters.length !== 1) throw new Error("章槽候选数量不一致。");
    const next = appendOutlineSlot(workspace, volume.id, from, generated.output.chapters[0], state);
    await service.appendMissingRoutes(novelId, next);
    return {availableRouteCount: 1, extended: true};
  });
}
