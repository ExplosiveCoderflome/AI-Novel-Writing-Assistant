import {prisma} from "../../../db/prisma";
import {FactIntegrityError, type ArtifactTypeInfo, type RunContract, type RunControl} from "../../../modules/director";

const reviewTargets: Record<string, string> = {
  story_macro: "故事规划", book_contract: "创作约定", world_skeleton: "世界设定",
  character_cast: "角色阵容", volume_strategy: "卷纲", volume_beat_sheet: "节奏段",
  volume_chapter_list: "章节路线", chapter_task_sheet: "章节任务与场景",
  chapter_execution_contract: "正文执行计划", chapter_batch_closed: "本批次正文",
};

export const directorArtifactTypes: Readonly<Record<string, ArtifactTypeInfo>> = Object.fromEntries(
  Object.entries(reviewTargets).map(([type, label]) => [type, {label, reviewRoute: `/lab/director/:novelId?review=${type}`}]),
);

export interface SavedReviewContext {
  type:string; novelId:string; runId:string; controlVersion:number;
  from?:number; to?:number; chapterId?:string; volumeId?:string;
}

/** Resolve only the open chapter gates, using saved current-book identities, never a first-row default. */
export async function resolveSavedReviewContexts({contract, control}: {contract: RunContract; control: RunControl}): Promise<SavedReviewContext[]> {
  const types = control.status === "waiting_gate" ? control.gate?.artifactTypes ?? [] : [];
  const contexts:SavedReviewContext[]=types.map(type=>({type,novelId:contract.novelId,runId:contract.runId,controlVersion:control.version}));
  const chapterTypes = contexts.filter(row => ["chapter_task_sheet", "chapter_execution_contract", "chapter_batch_closed"].includes(row.type));
  if (!chapterTypes.length) return contexts;
  const from = contract.chapterRange?.from, to = contract.chapterRange?.to;
  if (!from || !to || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from) throw new FactIntegrityError("待确认章节缺少有效的授权范围。");
  for (const context of chapterTypes) {
    const {type}=context;
    if (type === "chapter_batch_closed") {
      const chapters = await prisma.chapter.findMany({where: {novelId: contract.novelId, order: from}, select: {id: true}});
      if (chapters.length !== 1) throw new FactIntegrityError("待确认正文缺少唯一的已保存章节。");
      context.chapterId=chapters[0].id;
    } else {
      const chapters = await prisma.volumeChapterPlan.findMany({where: {volume: {novelId: contract.novelId}, chapterOrder: from}, select: {id: true, volumeId: true}});
      if (chapters.length !== 1 || (contract.launchInput?.targetVolumeId && chapters[0].volumeId !== contract.launchInput.targetVolumeId)) {
        throw new FactIntegrityError("待确认计划缺少唯一的已保存目标卷章节。");
      }
      context.volumeId=chapters[0].volumeId;
      if (type === "chapter_execution_contract") {
        const saved = await prisma.chapter.findMany({where: {novelId: contract.novelId, order: from}, select: {id: true}});
        if (saved.length !== 1) throw new FactIntegrityError("待确认执行计划缺少唯一的已保存章节。");
        context.chapterId=saved[0].id;
      } else context.chapterId=chapters[0].id;
    }
    context.from=from;context.to=to;
  }
  return contexts;
}

export async function resolveConfirmationArtifactTypes(input: {contract: RunContract; control: RunControl}) {
  await resolveSavedReviewContexts(input);
  return directorArtifactTypes;
}
