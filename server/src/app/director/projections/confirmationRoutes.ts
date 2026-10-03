import {prisma} from "../../../db/prisma";
import {FactIntegrityError, type ArtifactTypeInfo, type RunContract, type RunControl} from "../../../modules/director";

const reviewTargets: Record<string, {label: string; stage: string}> = {
  story_macro: {label: "故事规划", stage: "story_macro"},
  book_contract: {label: "创作约定", stage: "basic"},
  world_skeleton: {label: "世界设定", stage: "world"},
  character_cast: {label: "角色阵容", stage: "character"},
  volume_strategy: {label: "卷纲", stage: "outline"},
  volume_beat_sheet: {label: "节奏段", stage: "structured"},
  volume_chapter_list: {label: "章节路线", stage: "structured"},
  chapter_task_sheet: {label: "章节任务与场景", stage: "structured"},
  chapter_execution_contract: {label: "正文执行计划", stage: "structured"},
  chapter_batch_closed: {label: "本批次正文", stage: "chapter"},
};

export const directorArtifactTypes: Readonly<Record<string, ArtifactTypeInfo>> = Object.fromEntries(
  Object.entries(reviewTargets).map(([type, {label, stage}]) => [type, {label, reviewRoute: `/novels/:novelId/edit?stage=${stage}`}]),
);

/** Resolve only the open chapter gates, using saved current-book identities, never a first-row default. */
export async function resolveConfirmationArtifactTypes({contract, control}: {contract: RunContract; control: RunControl}) {
  const types = control.status === "waiting_gate" ? control.gate?.artifactTypes ?? [] : [];
  const chapterTypes = types.filter(type => ["chapter_task_sheet", "chapter_execution_contract", "chapter_batch_closed"].includes(type));
  if (!chapterTypes.length) return directorArtifactTypes;
  const from = contract.chapterRange?.from;
  if (!from || !Number.isSafeInteger(from) || from < 1) throw new FactIntegrityError("待确认章节缺少有效的授权范围。");
  const resolved = {...directorArtifactTypes};
  for (const type of chapterTypes) {
    const query = new URLSearchParams({stage: reviewTargets[type].stage});
    if (type === "chapter_batch_closed") {
      const chapters = await prisma.chapter.findMany({where: {novelId: contract.novelId, order: from}, select: {id: true}});
      if (chapters.length !== 1) throw new FactIntegrityError("待确认正文缺少唯一的已保存章节。");
      query.set("chapterId", chapters[0].id);
    } else {
      const chapters = await prisma.volumeChapterPlan.findMany({where: {volume: {novelId: contract.novelId}, chapterOrder: from}, select: {id: true, volumeId: true}});
      if (chapters.length !== 1 || (contract.launchInput?.targetVolumeId && chapters[0].volumeId !== contract.launchInput.targetVolumeId)) {
        throw new FactIntegrityError("待确认计划缺少唯一的已保存目标卷章节。");
      }
      query.set("volumeId", chapters[0].volumeId);
      query.set("chapterId", chapters[0].id);
    }
    resolved[type] = {...resolved[type], reviewRoute: `/novels/${encodeURIComponent(contract.novelId)}/edit?${query}`};
  }
  return resolved;
}
