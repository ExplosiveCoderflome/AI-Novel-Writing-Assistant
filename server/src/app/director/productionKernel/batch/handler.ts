import type { StepContext, StepHandler, StepResult } from "../../../../modules/director";
import { hashProductionContent, type UnitOutcome } from "../../../../modules/production";
import { mapProductionUnitOutcome } from "../outcomeMapping";

export interface KernelBatchChapter {id: string; novelId: string; order: number; content: string | null}
export interface KernelChapterBatchDependencies {
  assertActive(context: StepContext): Promise<void>;
  readChapters(context: StepContext): Promise<KernelBatchChapter[]>;
  readOutcome(context: StepContext, chapter: KernelBatchChapter): Promise<UnitOutcome | undefined>;
  runChapter(context: StepContext, chapter: KernelBatchChapter): Promise<UnitOutcome>;
  hashBatch(chapters: {id: string; order: number; content: string | null}[]): string;
}
const invalid = (debts: NonNullable<StepResult["debts"]> = []): StepResult => ({debts,
  stopSignal:{kind:"data_integrity",action:"fail_task",source:"runtime",reason:"授权章节的正文与完成记录不一致，请返回章节页面检查。"}});

/** Caller-owned range execution. Saved outcomes may close chapters; a generated manuscript alone cannot. */
export function createKernelChapterBatchHandler(deps: KernelChapterBatchDependencies): StepHandler {
  return async context => {
    const range = context.contract.chapterRange;
    if (!range || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to < range.from) return invalid();
    await deps.assertActive(context);
    const chapters = (await deps.readChapters(context)).sort((a,b) => a.order-b.order);
    if (chapters.length !== range.to-range.from+1 || new Set(chapters.map(chapter=>chapter.id)).size !== chapters.length
      || chapters.some((chapter,index) => chapter.novelId !== context.contract.novelId || chapter.order !== range.from+index)) return invalid();
    const debts: NonNullable<StepResult["debts"]>[number][] = [], hashes = new Map<string,string>();
    for (const chapter of chapters) {
      await deps.assertActive(context);
      const saved = await deps.readOutcome(context,chapter);
      const outcome = saved ?? await deps.runChapter(context,chapter);
      const mapped = mapProductionUnitOutcome(outcome);
      if (mapped.unit.novelId !== chapter.novelId || mapped.unit.chapterId !== chapter.id || mapped.unit.order !== chapter.order) return invalid(debts);
      debts.push(...mapped.debts);
      if (mapped.stopSignal) return {debts,stopSignal:mapped.stopSignal};
      if (!mapped.closed || !outcome.progress.committedContentHash) return invalid(debts);
      hashes.set(chapter.id,outcome.progress.committedContentHash);
    }
    await deps.assertActive(context);
    const current = (await deps.readChapters(context)).sort((a,b) => a.order-b.order);
    if (current.length !== chapters.length || current.some((chapter,index) => chapter.id !== chapters[index].id
      || chapter.novelId !== context.contract.novelId || chapter.order !== range.from+index || !chapter.content?.trim()
      || hashProductionContent(chapter.content) !== hashes.get(chapter.id))) return invalid(debts);
    return {debts,artifact:{scope:context.contract.scope,status:"draft",protectedUserContent:false,
      contentRef:`chapter_batch_closed:${context.contract.novelId}:${range.from}-${range.to}`,
      contentHash:deps.hashBatch(current.map(({id,order,content})=>({id,order,content})))}};
  };
}
