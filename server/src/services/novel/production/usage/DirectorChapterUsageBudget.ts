import type {PipelineDirectorSnapshot} from "../directorBridge";

export const DIRECTOR_CHAPTER_TOKEN_LIMIT = 100_000;
/** Conservative fallback when the next stage has no usable estimate. */
export const DIRECTOR_CHAPTER_PREFLIGHT_RESERVE_TOKENS = 16_000;

export interface ChapterUsageCounters {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}
type Usage = number | ChapterUsageCounters;
type Checkpoint = NonNullable<PipelineDirectorSnapshot["chapterUsage"]>[number];

function validCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("章节用量计数无效，不能继续生成。");
}
function total(usage: Usage): number {
  if (typeof usage === "number") {validCount(usage); return usage;}
  for (const value of [usage.totalTokens, usage.promptTokens, usage.completionTokens, usage.cacheHitTokens]) validCount(value);
  if (usage.cacheHitTokens > usage.promptTokens) throw new Error("缓存用量计数超过输入，不能继续生成。");
  return usage.totalTokens;
}

export function beginChapterUsage(snapshot: PipelineDirectorSnapshot, chapterId: string, chapterOrder: number,
  job: Usage, batch?: Usage): boolean {
  const jobTokens = total(job);
  if (batch !== undefined) total(batch);
  const rows = snapshot.chapterUsage ??= [];
  const previous = rows.find(row => row.chapterId === chapterId || row.chapterOrder === chapterOrder);
  if (previous) {
    if (previous.chapterId !== chapterId || previous.chapterOrder !== chapterOrder) throw new Error("章节用量检查点身份不一致。");
    if (previous.endJobTokens !== undefined) throw new Error("本章用量已闭合，不能在同一作业重新生成已保存正文。");
    return false;
  }
  const row: Checkpoint = {chapterId, chapterOrder, startJobTokens: jobTokens, totalTokens: 0,
    ...(batch !== undefined ? {startChapterBatchTokens: total(batch)} : {})};
  if (typeof job !== "number" && (batch === undefined || typeof batch !== "number")) {
    Object.assign(row, {metric: "uncached_tokens_v1", startPromptTokens: job.promptTokens,
      startCompletionTokens: job.completionTokens, startCacheHitTokens: job.cacheHitTokens,
      promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, effectiveTokens: 0,
      ...(batch ? {startBatchPromptTokens: batch.promptTokens, startBatchCompletionTokens: batch.completionTokens,
        startBatchCacheHitTokens: batch.cacheHitTokens} : {})});
  }
  rows.push(row);
  return true;
}

export function observeChapterUsage(snapshot: PipelineDirectorSnapshot, chapterId: string, job: Usage, batch?: Usage) {
  const jobTokens = total(job);
  if (batch !== undefined) total(batch);
  const checkpoint = snapshot.chapterUsage?.find(row => row.chapterId === chapterId);
  if (!checkpoint) throw new Error("缺少已保存的章节用量检查点。");
  const closed = checkpoint.endJobTokens !== undefined;
  if (closed && jobTokens < checkpoint.endJobTokens!) throw new Error("章节用量计数倒退，不能继续生成。");
  // Closed boundaries are immutable. Never subtract a live planning counter
  // from saved net components, or attribute the next chapter's usage here.
  if (closed) return observed(checkpoint);
  const rawTotal = jobTokens - checkpoint.startJobTokens;
  const planningDelta = checkpoint.startChapterBatchTokens !== undefined && batch !== undefined
    ? total(batch) - checkpoint.startChapterBatchTokens : 0;
  const totalTokens = rawTotal - planningDelta;
  if (planningDelta < 0 || planningDelta > rawTotal || totalTokens < checkpoint.totalTokens) {
    throw new Error("章节用量计数倒退，不能继续生成。");
  }
  if (checkpoint.metric === "uncached_tokens_v1") {
    if (typeof job === "number" || (checkpoint.startChapterBatchTokens !== undefined && (batch === undefined || typeof batch === "number"))) {
      throw new Error("章节分项用量计数暂不可读取，不能继续生成。");
    }
    const planning = typeof batch === "object" && checkpoint.startChapterBatchTokens !== undefined ? batch : undefined;
    const promptTokens = job.promptTokens - checkpoint.startPromptTokens! - (planning ? planning.promptTokens - checkpoint.startBatchPromptTokens! : 0);
    const completionTokens = job.completionTokens - checkpoint.startCompletionTokens! - (planning ? planning.completionTokens - checkpoint.startBatchCompletionTokens! : 0);
    const cacheHitTokens = job.cacheHitTokens - checkpoint.startCacheHitTokens! - (planning ? planning.cacheHitTokens - checkpoint.startBatchCacheHitTokens! : 0);
    for (const value of [promptTokens, completionTokens, cacheHitTokens]) validCount(value);
    if (promptTokens < checkpoint.promptTokens! || completionTokens < checkpoint.completionTokens! || cacheHitTokens < checkpoint.cacheHitTokens!
      || cacheHitTokens > promptTokens) throw new Error("章节分项用量计数倒退或不一致，不能继续生成。");
    // Providers may return only a total. Unknown components cannot create a
    // free allowance: retain that reported remainder without guessing its split.
    const unclassifiedTokens = Math.max(0, totalTokens - promptTokens - completionTokens);
    const effectiveTokens = promptTokens - cacheHitTokens + completionTokens + unclassifiedTokens;
    validCount(effectiveTokens);
    if (effectiveTokens < checkpoint.effectiveTokens!) throw new Error("章节有效用量计数倒退，不能继续生成。");
    Object.assign(checkpoint, {promptTokens, completionTokens, cacheHitTokens, effectiveTokens, unclassifiedTokens});
  }
  checkpoint.totalTokens = totalTokens;
  return observed(checkpoint);
}
function observed(checkpoint: Checkpoint) {
  return {totalTokens: checkpoint.totalTokens,
    exceeded: (checkpoint.effectiveTokens ?? checkpoint.totalTokens) >= (checkpoint.tokenLimit ?? DIRECTOR_CHAPTER_TOKEN_LIMIT)};
}
/** Freeze attribution before any call whose subject is a future chapter. */
export function finalizeChapterUsage(snapshot: PipelineDirectorSnapshot, chapterId: string, job: Usage, batch?: Usage) {
  const result = observeChapterUsage(snapshot, chapterId, job, batch);
  const checkpoint = snapshot.chapterUsage!.find(row => row.chapterId === chapterId)!;
  checkpoint.endJobTokens ??= total(job);
  if (checkpoint.startChapterBatchTokens !== undefined && batch !== undefined) checkpoint.endChapterBatchTokens ??= total(batch);
  return result;
}
