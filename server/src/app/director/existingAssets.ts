import {prisma} from "../../db/prisma";
import {isSavedVolumeChapterListComplete, type ExistingNovelAsset, type RunContract} from "../../modules/director";
import {normalizeVolumeWorkspaceDocument} from "../../services/novel/volume/volumeWorkspaceDocument";
import {isDecompositionComplete} from "../../services/novel/storyMacro/storyMacroPlanUtils";
import {StoryMacroPlanService} from "../../services/novel/storyMacro/StoryMacroPlanService";
import {findTargetVolume} from "./productionInputs";

/** Read-only takeover inventory; getVolumes is intentionally avoided because it can persist compatibility state. */
export async function readExistingAssets(contract: RunContract): Promise<ExistingNovelAsset[]> {
  const novelId = contract.novelId;
  const [novel, macro, book, characters, version, chapters] = await Promise.all([
    prisma.novel.findUniqueOrThrow({where: {id: novelId}, select: {worldId: true}}),
    new StoryMacroPlanService().getPlan(novelId),
    prisma.bookContract.findUnique({where: {novelId}}),
    prisma.character.findMany({where: {novelId}, orderBy: {id: "asc"}}),
    prisma.volumePlanVersion.findFirst({where: {novelId, status: "active"}, orderBy: {version: "desc"}}),
    prisma.chapter.findMany({where: {novelId}, orderBy: {order: "asc"}}),
  ]);
  const assets: ExistingNovelAsset[] = [];
  const add = (type: string, content: unknown, usable = true, contentRef = `${type}:${novelId}`) => assets.push({type, contentRef, content, usable});
  if (macro?.decomposition) add("story_macro", macro, isDecompositionComplete(macro.decomposition));
  if (book) add("book_contract", book);
  if (novel.worldId) add("world_skeleton", {worldId: novel.worldId});
  else if (contract.launchInput?.worldMode === "skip") add("world_skeleton", {disabled: true}, true, `world_skeleton:${novelId}:disabled`);
  if (characters.length) add("character_cast", characters);
  const prose = chapters.filter(chapter => chapter.content?.trim());
  for (const chapter of prose) assets.push({type: "chapter_draft", scope: `chapter:${chapter.order}`, usable: true, contentRef: `chapter:${chapter.id}`, content: {id: chapter.id, order: chapter.order, content: chapter.content}});
  if (version) {
    const workspace = normalizeVolumeWorkspaceDocument(novelId, version.contentJson, {activeVersionId: version.id});
    if (!workspace) throw new Error("已保存的卷规划无法读取，请先在规划页核对。");
    if (workspace.volumes.length) add("volume_strategy", workspace);
    const targetId = workspace.volumes.length ? findTargetVolume({contract},workspace) : undefined;
    const volume = workspace.volumes.find(item => item.id === targetId);
    const beats = workspace.beatSheets.find(item => item.volumeId === targetId);
    if (beats?.beats.length) add("volume_beat_sheet", beats, true, `volume_beat_sheet:${novelId}:${targetId}`);
    if (volume?.chapters.length) {
      const range = contract.chapterRange;
      if (!range && isSavedVolumeChapterListComplete(volume)) add("volume_chapter_list", volume.chapters, true, `volume_chapter_list:${novelId}:${targetId}`);
      else if (range && volume.chapters.some(chapter => chapter.chapterOrder === range.from)) {
        const minimum = Math.min(3, range.to-range.from+1);
        const target = Math.min(5, range.to-range.from+1);
        const planned = workspace.volumes.flatMap(item => item.chapters);
        const routes: typeof planned = [];
        let unique = true;
        for (let order = range.from; order < range.from+target; order++) {
          const matches = planned.filter(chapter => chapter.chapterOrder === order);
          if (matches.length > 1) {unique = false; break;}
          if (!matches.length) break;
          routes.push(matches[0]);
        }
        if (unique && routes.length >= minimum) add("volume_chapter_list", routes, true, `volume_chapter_list:${novelId}:${targetId}`);
      }
    }
    const from = contract.chapterRange?.from;
    if (from) {
      const planned = workspace.volumes.flatMap(item => item.chapters).filter(item => item.chapterOrder === from);
      if (planned.length === 1 && planned[0].taskSheet?.trim() && planned[0].sceneCards?.trim()) add("chapter_task_sheet", planned[0]);
      const saved = chapters.find(item => item.order === from);
      if (saved?.taskSheet?.trim() && saved.sceneCards?.trim()) add("chapter_execution_contract", {id: saved.id, taskSheet: saved.taskSheet, sceneCards: saved.sceneCards});
    }
  }
  return assets;
}
