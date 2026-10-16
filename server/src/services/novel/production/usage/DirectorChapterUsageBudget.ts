import type {PipelineDirectorSnapshot} from "../directorBridge";

/** Per-chapter safety ceiling, independent of the retired director control loop. */
export const DIRECTOR_CHAPTER_TOKEN_LIMIT = 100_000;

/**
 * Output tokens cost several times more than input tokens on metered providers.
 * The chapter budget compares effective tokens, so output-heavy chapters reach
 * the ceiling earlier than their raw token count suggests.
 */
export const DIRECTOR_CHAPTER_OUTPUT_TOKEN_WEIGHT = 2;

/**
 * Leave room for the next prompt and its structured side effects before an
 * internal chapter step starts. The job counter is observed after an LLM call
 * finishes, so a preflight margin prevents one large call from jumping far
 * past the chapter ceiling.
 */
export const DIRECTOR_CHAPTER_PREFLIGHT_RESERVE_TOKENS = 16_000;

/** Job-level usage counters as read from the generation job row. */
export interface ChapterUsageCounters {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

/** Per-chapter usage split used for the budget comparison and pause message. */
export interface ChapterUsageBreakdown {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

/**
 * Billable-equivalent tokens for the budget comparison: cached input tokens
 * are excluded (a cache hit costs a fraction of a cache miss) and output
 * tokens are weighted by DIRECTOR_CHAPTER_OUTPUT_TOKEN_WEIGHT.
 */
export function effectiveChapterTokens(breakdown: ChapterUsageBreakdown): number {
  const billableInput = Math.max(0, breakdown.promptTokens - breakdown.cacheHitTokens);
  return billableInput + breakdown.completionTokens * DIRECTOR_CHAPTER_OUTPUT_TOKEN_WEIGHT;
}

function validCount(total: number) {
  if(!Number.isSafeInteger(total) || total < 0) throw new Error("章节用量计数无效，不能继续生成。");
}

function validCounters(counters: ChapterUsageCounters) {
  validCount(counters.totalTokens);
  validCount(counters.promptTokens);
  validCount(counters.completionTokens);
  validCount(counters.cacheHitTokens);
}

const ZERO_BREAKDOWN: ChapterUsageBreakdown = { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 };

function hasComponentBaseline(row: {
  startPromptTokens?: number; startCompletionTokens?: number; startCacheHitTokens?: number;
}): row is { startPromptTokens: number; startCompletionTokens: number; startCacheHitTokens: number } {
  return row.startPromptTokens !== undefined
    && row.startCompletionTokens !== undefined
    && row.startCacheHitTokens !== undefined;
}

export function beginChapterUsage(
  snapshot: PipelineDirectorSnapshot,
  chapterId: string,
  chapterOrder: number,
  jobUsage: ChapterUsageCounters,
  chapterBatchUsage?: ChapterUsageCounters,
): boolean {
  validCounters(jobUsage);
  if (chapterBatchUsage !== undefined) validCounters(chapterBatchUsage);
  const rows=snapshot.chapterUsage ??= [];
  const previous=rows.find(row=>row.chapterId === chapterId || row.chapterOrder === chapterOrder);
  if(previous) {
    if(previous.chapterId !== chapterId || previous.chapterOrder !== chapterOrder) throw new Error("章节用量检查点身份不一致。");
    if(previous.endJobTokens !== undefined) throw new Error("本章用量已闭合，不能在同一作业重新生成已保存正文。");
    return false;
  }
  rows.push({
    chapterId,
    chapterOrder,
    startJobTokens:jobUsage.totalTokens,
    startPromptTokens:jobUsage.promptTokens,
    startCompletionTokens:jobUsage.completionTokens,
    startCacheHitTokens:jobUsage.cacheHitTokens,
    ...(chapterBatchUsage !== undefined ? {
      startChapterBatchTokens: chapterBatchUsage.totalTokens,
      startChapterBatchPromptTokens: chapterBatchUsage.promptTokens,
      startChapterBatchCompletionTokens: chapterBatchUsage.completionTokens,
      startChapterBatchCacheHitTokens: chapterBatchUsage.cacheHitTokens,
    } : {}),
    totalTokens:0,
    promptTokens:0,
    completionTokens:0,
    cacheHitTokens:0,
    effectiveTokens:0,
  });
  return true;
}

function batchDelta(
  checkpoint: { startChapterBatchTokens?: number; startChapterBatchPromptTokens?: number; startChapterBatchCompletionTokens?: number; startChapterBatchCacheHitTokens?: number },
  chapterBatchUsage: ChapterUsageCounters | undefined,
  raw: ChapterUsageBreakdown & { totalTokens: number },
) {
  if (chapterBatchUsage === undefined) return { totalTokens: 0, ...ZERO_BREAKDOWN };
  const totalTokens = checkpoint.startChapterBatchTokens !== undefined
    ? chapterBatchUsage.totalTokens - checkpoint.startChapterBatchTokens
    : 0;
  const promptTokens = checkpoint.startChapterBatchPromptTokens !== undefined
    ? chapterBatchUsage.promptTokens - checkpoint.startChapterBatchPromptTokens
    : 0;
  const completionTokens = checkpoint.startChapterBatchCompletionTokens !== undefined
    ? chapterBatchUsage.completionTokens - checkpoint.startChapterBatchCompletionTokens
    : 0;
  const cacheHitTokens = checkpoint.startChapterBatchCacheHitTokens !== undefined
    ? chapterBatchUsage.cacheHitTokens - checkpoint.startChapterBatchCacheHitTokens
    : 0;
  if (totalTokens < 0 || totalTokens > raw.totalTokens
    || promptTokens < 0 || promptTokens > raw.promptTokens
    || completionTokens < 0 || completionTokens > raw.completionTokens
    || cacheHitTokens < 0 || cacheHitTokens > raw.cacheHitTokens) {
    throw new Error("章节规划用量计数倒退，不能继续生成。");
  }
  return { totalTokens, promptTokens, completionTokens, cacheHitTokens };
}

export function observeChapterUsage(
  snapshot: PipelineDirectorSnapshot,
  chapterId: string,
  jobUsage: ChapterUsageCounters,
  chapterBatchUsage?: ChapterUsageCounters,
) {
  validCounters(jobUsage);
  if (chapterBatchUsage !== undefined) validCounters(chapterBatchUsage);
  const checkpoint=snapshot.chapterUsage?.find(row=>row.chapterId === chapterId);
  if(!checkpoint) throw new Error("缺少已保存的章节用量检查点。");
  if (checkpoint.endJobTokens !== undefined && jobUsage.totalTokens < checkpoint.endJobTokens) throw new Error("章节用量计数倒退，不能继续生成。");
  const endJobTokens = checkpoint.endJobTokens ?? jobUsage.totalTokens;
  const rawTotalTokens=endJobTokens-checkpoint.startJobTokens;

  if (!hasComponentBaseline(checkpoint)) {
    // Rows recorded before per-component tracking keep the legacy blended
    // accounting so in-flight snapshots keep resuming with identical semantics.
    const planningDelta = checkpoint.startChapterBatchTokens !== undefined
      && chapterBatchUsage !== undefined
      ? chapterBatchUsage.totalTokens - checkpoint.startChapterBatchTokens
      : 0;
    if (planningDelta < 0 || planningDelta > rawTotalTokens) throw new Error("章节规划用量计数倒退，不能继续生成。");
    const totalTokens=rawTotalTokens-planningDelta;
    if(totalTokens < checkpoint.totalTokens) throw new Error("章节用量计数倒退，不能继续生成。");
    checkpoint.totalTokens=totalTokens;
    return {totalTokens,promptTokens:0,completionTokens:0,cacheHitTokens:0,
      effectiveTokens:totalTokens,breakdownAvailable:false,exceeded:totalTokens >= DIRECTOR_CHAPTER_TOKEN_LIMIT};
  }

  const live = checkpoint.endJobTokens === undefined;
  const rawPromptTokens = live ? jobUsage.promptTokens - checkpoint.startPromptTokens : checkpoint.promptTokens ?? 0;
  const rawCompletionTokens = live ? jobUsage.completionTokens - checkpoint.startCompletionTokens : checkpoint.completionTokens ?? 0;
  const rawCacheHitTokens = live ? jobUsage.cacheHitTokens - checkpoint.startCacheHitTokens : checkpoint.cacheHitTokens ?? 0;
  if (rawPromptTokens < 0 || rawCompletionTokens < 0 || rawCacheHitTokens < 0) throw new Error("章节用量计数倒退，不能继续生成。");
  const planning = batchDelta(checkpoint, chapterBatchUsage, {
    totalTokens: rawTotalTokens, promptTokens: rawPromptTokens,
    completionTokens: rawCompletionTokens, cacheHitTokens: rawCacheHitTokens,
  });
  const totalTokens=rawTotalTokens-planning.totalTokens;
  const promptTokens=rawPromptTokens-planning.promptTokens;
  const completionTokens=rawCompletionTokens-planning.completionTokens;
  const cacheHitTokens=rawCacheHitTokens-planning.cacheHitTokens;
  if(totalTokens < checkpoint.totalTokens
    || promptTokens < (checkpoint.promptTokens ?? 0)
    || completionTokens < (checkpoint.completionTokens ?? 0)
    || cacheHitTokens < (checkpoint.cacheHitTokens ?? 0)) throw new Error("章节用量计数倒退，不能继续生成。");
  const breakdown: ChapterUsageBreakdown = { promptTokens, completionTokens, cacheHitTokens };
  const effectiveTokens=effectiveChapterTokens(breakdown);
  checkpoint.totalTokens=totalTokens;
  checkpoint.promptTokens=promptTokens;
  checkpoint.completionTokens=completionTokens;
  checkpoint.cacheHitTokens=cacheHitTokens;
  checkpoint.effectiveTokens=effectiveTokens;
  return {totalTokens,promptTokens,completionTokens,cacheHitTokens,effectiveTokens,
    breakdownAvailable:true,exceeded:effectiveTokens >= DIRECTOR_CHAPTER_TOKEN_LIMIT};
}

/** Save before any call whose subject is a future chapter, never reconstruct historical totals. */
export function finalizeChapterUsage(
  snapshot: PipelineDirectorSnapshot,
  chapterId: string,
  jobUsage: ChapterUsageCounters,
  chapterBatchUsage?: ChapterUsageCounters,
) {
  const observed = observeChapterUsage(snapshot, chapterId, jobUsage, chapterBatchUsage);
  const checkpoint = snapshot.chapterUsage!.find(row => row.chapterId === chapterId)!;
  checkpoint.endJobTokens ??= jobUsage.totalTokens;
  if (checkpoint.startChapterBatchTokens !== undefined && chapterBatchUsage !== undefined) {
    checkpoint.endChapterBatchTokens ??= chapterBatchUsage.totalTokens;
  }
  return observed;
}
