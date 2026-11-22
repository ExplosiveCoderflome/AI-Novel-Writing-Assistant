import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import type { FieldSuggestion, ReviewChange, ReviewProposal } from "@ai-novel/shared/types/director/review/fieldSuggestions";
import { AppError } from "../../../../middleware/errorHandler";
import { runWithLlmUsageTracking } from "../../../../llm/usageTracking";
import { AgentConversationStore, agentReplyLive, recentAgentDiscussion } from "../../../../modules/agentConversation";
import { artifactContentHash, type RunContract } from "../../../../modules/director";
import type { PromptExecutionOptions } from "../../../../prompting/core/promptTypes";

export const id = z.string().trim().min(1).max(160);
export const addressSchema = z.object({ novelId: id, runId: id, version: z.coerce.number().int().nonnegative(), resourceId: id, planVersionId: id.optional(), bodyHash:z.string().regex(/^[a-f0-9]{64}$/).optional() });
export type Address = z.infer<typeof addressSchema>;
interface Message<F extends string> {
  base: Record<F,string>; draft: Record<F,string>; requestText: string; requestId: string; parentResultId?: string;
}
export interface ReviewSubject<F extends string, R extends { base: Record<F,string> }> {
  artifact: "character_cast" | "volume_strategy" | "chapter_task_sheet" | "chapter_batch_closed"; scope: string; progress: string; stage: string;
  draft: z.ZodType<Record<F,string>>;
  changes: z.ZodType<ReviewChange<F>[]>; reply: z.ZodType<{replyText: string; changes: FieldSuggestion<F>[]}>;
  read(db: Prisma.TransactionClient, a: Address, contract: RunContract): Promise<R>;
  generate(resource: R, draft: Record<F,string>, context: {storyInput: string; requestText: string;
    history: ReturnType<typeof recentAgentDiscussion>; priorProposal: ReviewChange<F>[] | null}, options: PromptExecutionOptions): Promise<unknown>;
}

export type DiscussionSubject<F extends string,R extends {base:Record<F,string>}> = Pick<ReviewSubject<F,R>,"draft"|"changes"|"reply"|"generate"|"progress">;
export interface DiscussionContext<R> {resource:R; storyInput:string; options:PromptExecutionOptions; runId?:string; validateSend?:()=>void}
export class ReviewConversation<F extends string, R extends { base: Record<F, string> }, A extends {novelId:string}> {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient, private readonly subject: DiscussionSubject<F,R>, private readonly scope:(a:A)=>string,
    private readonly read:(db:Prisma.TransactionClient,a:A)=>Promise<DiscussionContext<R>>) {
    this.store = new AgentConversationStore(db);
  }
  async history(a: A): Promise<AgentConversationTurn<ReviewProposal<F>>[]> {
    await this.read(this.db, a);
    return (await this.store.history(this.scope(a))).map(row => ({
      id: row.id, requestText: row.requestText, createdAt: row.createdAt.toISOString(), replyText: row.replyText,
      parentResultId: row.parentResultId, contextVersion: row.contextVersion,
      status: z.enum(["running", "failed", "interrupted", "completed"]).parse(row.status),
      result: row.resultId && row.resultPayloadJson ? { id: row.resultId, status: "proposed",
        changes: this.subject.changes.parse(JSON.parse(row.resultPayloadJson)) } : null,
    }));
  }

  async send(a: A, input: Message<F>) {
    const {resource,storyInput,options,runId,validateSend} = await this.read(this.db,a);
    validateSend?.();
    const fields = Object.keys(resource.base) as F[];
    if ([input.base, input.draft].some(form => Object.keys(form).length !== fields.length || fields.some(field => !Object.hasOwn(form, field)))) {
      throw new AppError("编辑字段有变化，请重新打开确认页。", 409);
    }
    for (const field of fields) {
      if (resource.base[field] !== input.base[field]) throw new AppError("资料有更新，请重新打开确认页再讨论。", 409);
      if (input.draft[field] !== input.base[field] && input.draft[field].length > 12000) throw new AppError("每项修改最多 12000 字。", 400);
    }
    const scopeKey = this.scope(a);
    const previous = input.parentResultId ? await this.db.agentConversationTurn.findFirst({
      where: { scopeKey, resultId: input.parentResultId, status: "completed" }, select: { resultPayloadJson: true },
    }) : null;
    if (input.parentResultId && !previous?.resultPayloadJson) throw new AppError("请从当前讨论中选择要追问的建议。", 409);
    const priorProposal = previous?.resultPayloadJson ? this.subject.changes.parse(JSON.parse(previous.resultPayloadJson)) : null;
    const contextVersion = artifactContentHash([input.base, input.draft]);
    return this.store.startReply({ ...input, scopeKey, contextVersion }, async () => {
      const history = recentAgentDiscussion(await this.store.history(scopeKey));
      const reply = await agentReplyLive.during(input.requestId, this.subject.progress, true, itemKey =>
        runWithLlmUsageTracking({ directorNextRunId: runId, novelId: a.novelId, stage: options.stage }, () =>
          this.subject.generate(resource, input.draft, { storyInput, history, priorProposal, requestText: input.requestText }, { ...options, itemKey })));
      const { changes, replyText } = this.subject.reply.parse(reply);
      if (changes.some(item => !Object.hasOwn(input.draft, item.field))) throw new AppError("建议涉及当前编辑稿以外的内容，请重新讨论。", 422);
      const edits = changes.filter(item => input.draft[item.field] !== item.value)
        .map(item => ({ ...item, before: input.draft[item.field] }));
      const unchanged = changes.length - edits.length;
      const visibleReply = unchanged ? [
        replyText,
        edits.length ? `有 ${unchanged} 项建议与当前稿一致，另有 ${edits.length} 项修改可逐项选择。` : "本轮建议与当前稿一致，可以直接保留原文。",
      ].join("\n\n") : replyText;
      await this.db.$transaction(async tx => {
        const latest = await this.read(tx, a);
        if (Object.keys(latest.resource.base).length !== fields.length || fields.some(field => latest.resource.base[field] !== input.base[field])) {
          throw new AppError("讨论期间资料有更新，请读取新稿再讨论。", 409);
        }
        await AgentConversationStore.complete(tx, scopeKey, input.requestId, edits.length ? input.requestId : null,
          visibleReply, edits.length ? JSON.stringify(edits) : undefined);
      }, { isolationLevel: "Serializable" });
    }, error => error instanceof AppError ? error.message : "本轮讨论未完成，可以用这条要求重试。");
  }

  async turnStatus(a: A, id: string) {
    await this.read(this.db, a);
    const turn = await this.db.agentConversationTurn.findFirst({ where: { scopeKey: this.scope(a), id }, select: { status: true } });
    if (!turn) throw new AppError("找不到这条讨论。", 404);
    return turn.status;
  }

  async interrupt(a: A, id: string) {
    await this.read(this.db, a);
    await this.store.stop(this.scope(a), id, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(id);
  }
}
