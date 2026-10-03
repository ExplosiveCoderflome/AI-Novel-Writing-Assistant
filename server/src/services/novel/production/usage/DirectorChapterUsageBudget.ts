import type {PipelineDirectorSnapshot} from "../directorBridge";

/** Existing per-chapter safety ceiling, independent of the retired director control loop. */
export const DIRECTOR_CHAPTER_TOKEN_LIMIT = 80_000;

function validCount(total: number) {
  if(!Number.isSafeInteger(total) || total < 0) throw new Error("章节用量计数无效，不能继续生成。");
}

export function beginChapterUsage(snapshot: PipelineDirectorSnapshot, chapterId: string, chapterOrder: number, jobTokens: number): boolean {
  validCount(jobTokens);
  const rows=snapshot.chapterUsage ??= [];
  const previous=rows.find(row=>row.chapterId === chapterId || row.chapterOrder === chapterOrder);
  if(previous) {
    if(previous.chapterId !== chapterId || previous.chapterOrder !== chapterOrder) throw new Error("章节用量检查点身份不一致。");
    return false;
  }
  rows.push({chapterId,chapterOrder,startJobTokens:jobTokens,totalTokens:0});
  return true;
}

export function observeChapterUsage(snapshot: PipelineDirectorSnapshot, chapterId: string, jobTokens: number) {
  validCount(jobTokens);
  const checkpoint=snapshot.chapterUsage?.find(row=>row.chapterId === chapterId);
  if(!checkpoint) throw new Error("缺少已保存的章节用量检查点。");
  const totalTokens=jobTokens-checkpoint.startJobTokens;
  if(totalTokens < checkpoint.totalTokens) throw new Error("章节用量计数倒退，不能继续生成。");
  checkpoint.totalTokens=totalTokens;
  return {totalTokens,exceeded:totalTokens >= DIRECTOR_CHAPTER_TOKEN_LIMIT};
}
