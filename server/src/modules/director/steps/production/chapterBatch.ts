import type { StepContext, StepHandler, StepResult } from "../../application";
import type { StopSignal } from "../../domain";

interface BatchOptions {startOrder: number; endOrder: number}
export interface BatchJob {
  id: string; novelId: string; startOrder: number; endOrder: number;
  status: string; pendingManualRecovery?: boolean;
}
interface ClosedChapter {id: string; novelId: string; order: number; content: string | null; closed: boolean}
export interface BatchOutcome {
  chapters: readonly ClosedChapter[];
  debts: NonNullable<StepResult["debts"]>;
  stopSignal?: StopSignal;
}
export interface ChapterBatchDependencies<Options extends BatchOptions> {
  inputProvider(context: StepContext): Promise<Options>;
  /** Durable binding; startup service must also deduplicate the start-before-bind crash window. */
  jobBinding: {get(runId: string): Promise<string | null>; save(runId: string, jobId: string): Promise<void>};
  pipelineService: {
    startPipelineJob(novelId: string, options: Options & {skipCompleted: true}): Promise<BatchJob>;
    getPipelineJobById(jobId: string): Promise<BatchJob | null>;
    resumePipelineJob(jobId: string, options: {preserveManualRecovery: true}): Promise<void>;
  };
  readOutcome(job: BatchJob, context: StepContext): Promise<BatchOutcome>;
  /** Worker renews its lease while this adapter waits; no nested director heartbeat loop. */
  waitForPoll(): Promise<void>;
  isRunActive(runId: string): Promise<boolean>;
  contentHash(content: unknown): string;
}
const active = (job: BatchJob) => (job.status === "queued" || job.status === "running") && !job.pendingManualRecovery;
const integrity = (reason: string): StepResult => ({stopSignal: {kind: "data_integrity", reason}});

export function createChapterBatchStepHandler<Options extends BatchOptions>(dependencies: ChapterBatchDependencies<Options>): StepHandler {
  return async context => {
    const input = await dependencies.inputProvider(context);
    const range = context.contract.chapterRange;
    if (!range || !Number.isSafeInteger(input.startOrder) || !Number.isSafeInteger(input.endOrder)
      || input.startOrder < 1 || input.endOrder < input.startOrder || input.startOrder < range.from || input.endOrder > range.to) {
      throw new Error("正文批次缺少明确授权的章节范围。");
    }
    const novelId = context.contract.novelId;
    const bound = await dependencies.jobBinding.get(context.runId);
    let job = bound ? await dependencies.pipelineService.getPipelineJobById(bound)
      : await dependencies.pipelineService.startPipelineJob(novelId, {...input, skipCompleted: true});
    const valid = (candidate: BatchJob | null): candidate is BatchJob => Boolean(candidate?.id && candidate.novelId === novelId
      && candidate.startOrder === input.startOrder && candidate.endOrder === input.endOrder && (!bound || candidate.id === bound));
    if (!valid(job)) return integrity("正文作业记录丢失、跨书或超出授权范围，请检查运行记录。");
    if (!bound) await dependencies.jobBinding.save(context.runId, job.id);
    if (bound && active(job)) await dependencies.pipelineService.resumePipelineJob(job.id, {preserveManualRecovery: true});
    while (active(job)) {
      if (!await dependencies.isRunActive(context.runId)) throw new Error("导演运行已结束或暂停，停止等待正文作业。");
      await dependencies.waitForPoll();
      const next = await dependencies.pipelineService.getPipelineJobById(job.id);
      if (!valid(next) || next.id !== job.id) return integrity("等待正文时作业身份或范围发生变化。");
      job = next;
    }
    const outcome = await dependencies.readOutcome(job, context);
    if (outcome.stopSignal) return {debts: outcome.debts, stopSignal: outcome.stopSignal};
    if (job.pendingManualRecovery) return integrity("正文作业等待人工恢复，但缺少结构化暂停决定。");
    if (outcome.chapters.some(chapter => chapter.novelId !== novelId)) return integrity("正文闭合结果包含其他小说章节。");
    const chapters = outcome.chapters.filter(chapter => chapter.order >= input.startOrder && chapter.order <= input.endOrder)
      .sort((a,b) => a.order-b.order);
    if (chapters.length !== input.endOrder-input.startOrder+1 || chapters.some((chapter,index) => chapter.order !== input.startOrder+index
      || !chapter.content?.trim() || !chapter.closed)) {
      return {debts: outcome.debts, stopSignal: {kind: "no_usable_content", action: "fail_task", reason: "授权批次存在未闭合或无可用正文的章节。"}};
    }
    return {debts: outcome.debts, artifact: {scope: context.contract.scope, status: "draft", protectedUserContent: false,
      contentRef: `chapter_batch_closed:${novelId}:${input.startOrder}-${input.endOrder}`, contentHash: dependencies.contentHash(chapters)}};
  };
}
