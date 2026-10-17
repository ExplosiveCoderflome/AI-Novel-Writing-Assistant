import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {buildVolumeWorkspaceDocument} from "../volumeWorkspaceDocument";

/** A route window can fill gaps, never replace saved chapters, move their orders or rewrite a beat. */
export function appendMissingRoutePlans(current: VolumePlanDocument, generated: VolumePlanDocument): VolumePlanDocument {
  if (current.novelId !== generated.novelId) throw new Error("章节路线不属于当前小说。");
  const orders = new Set(current.volumes.flatMap(volume => volume.chapters.map(chapter => chapter.chapterOrder)));
  const ids = new Set(current.volumes.flatMap(volume => volume.chapters.map(chapter => chapter.id)));
  const volumes = current.volumes.map(volume => ({...volume, chapters: [...volume.chapters]}));
  for (const proposed of generated.volumes) {
    let volume = volumes.find(row => row.id === proposed.id);
    if (!volume) {
      if (volumes.some(row => row.sortOrder === proposed.sortOrder)) throw new Error("补齐路线遇到卷序号冲突，请核对已有分卷。");
      volume = {...proposed, chapters: []};volumes.push(volume);
    }
    for (const chapter of proposed.chapters) {
      if (ids.has(chapter.id) || orders.has(chapter.chapterOrder)) continue;
      volume.chapters.push(chapter);ids.add(chapter.id);orders.add(chapter.chapterOrder);
    }
    volume.chapters.sort((a,b) => a.chapterOrder-b.chapterOrder);
  }
  const beatSheets = current.beatSheets.map(sheet => ({...sheet, beats: [...sheet.beats]}));
  for (const proposed of generated.beatSheets) {
    const currentSheet = beatSheets.find(row => row.volumeId === proposed.volumeId);
    if (!currentSheet) beatSheets.push(proposed);
    else for (const beat of proposed.beats) if (!currentSheet.beats.some(row => row.key === beat.key)) currentSheet.beats.push(beat);
  }
  return buildVolumeWorkspaceDocument({...current, volumes, beatSheets});
}
