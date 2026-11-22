import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import type { FieldSuggestion, ReviewChange, ReviewProposal } from "@ai-novel/shared/types/director/review/fieldSuggestions";
import { AppError } from "../../../../middleware/errorHandler";
import { runWithLlmUsageTracking } from "../../../../llm/usageTracking";
import { AgentConversationStore, agentReplyLive, recentAgentDiscussion } from "../../../../modules/agentConversation";
import { artifactContentHash, type RunContract } from "../../../../modules/director";
import { assertNovelDirectorVersion, readRunExecutionEpoch } from "../../../../modules/novel/director-routing";
import type { PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import { requireLaunch } from "../../productionInputs";

export const id = z.string().trim().min(1).max(160);
export const addressSchema = z.object({ novelId: id, runId: id, version: z.coerce.number().int().nonnegative(), resourceId: id, planVersionId: id.optional() });
export type Address = z.infer<typeof addressSchema>;
interface Message<F extends string> {
  base: Record<F,string>; draft: Record<F,string>; requestText: string; requestId: string; parentResultId?: string;
}
export interface ReviewSubject<F extends string, R extends { base: Record<F,string> }> {
  artifact: "character_cast" | "volume_strategy"; scope: string; progress: string; stage: string;
  fields: readonly F[]; draft: z.ZodType<Record<F,string>>;
  changes: z.ZodType<ReviewChange<F>[]>; reply: z.ZodType<{replyText: string; changes: FieldSuggestion<F>[]}>;
  read(db: Prisma.TransactionClient, a: Address): Promise<R>;
  generate(resource: R, draft: Record<F,string>, context: {storyInput: string; requestText: string;
    history: ReturnType<typeof recentAgentDiscussion>; priorProposal: ReviewChange<F>[] | null}, options: PromptExecutionOptions): Promise<unknown>;
}

export class ReviewConversation<F extends string, R extends { base: Record<F, string> }> {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient, private readonly subject: ReviewSubject<F, R>) {
    this.store = new AgentConversationStore(db);
  }

  private scope(a: Address) {
    return JSON.stringify([this.subject.scope, a.novelId, a.runId, a.version, ...(a.planVersionId ? [a.planVersionId] : []), a.resourceId]);
  }

  private async read(db: Prisma.TransactionClient, a: Address) {
    const row = await db.directorNextRunControl.findUnique({ where: { runId: a.runId }, include: { run: true } });
    if (!row || row.novelId !== a.novelId || row.run.novelId !== a.novelId || row.version !== a.version ||
        row.status !== "waiting_gate" || !z.object({artifactTypes: z.tuple([z.literal(this.subject.artifact)])}).safeParse(JSON.parse(row.gateJson ?? "null")).success) {
      throw new AppError("确认阶段有变化，请重新打开本书导演台。", 409);
    }
    const contract = JSON.parse(row.run.contractJson) as RunContract;
    if (contract.novelId !== a.novelId || contract.runId !== a.runId) throw new AppError("无法核对本书确认记录。", 409);
    await assertNovelDirectorVersion(a.novelId, "v2", readRunExecutionEpoch(row.run.contractJson), db);
    return { contract, resource: await this.subject.read(db, a) };
  }

  async history(a: Address): Promise<AgentConversationTurn<ReviewProposal<F>>[]> {
    await this.read(this.db, a);
    return (await this.store.history(this.scope(a))).map(row => ({
      id: row.id, requestText: row.requestText, createdAt: row.createdAt.toISOString(), replyText: row.replyText,
      parentResultId: row.parentResultId, contextVersion: row.contextVersion,
      status: z.enum(["running", "failed", "interrupted", "completed"]).parse(row.status),
      result: row.resultId && row.resultPayloadJson ? { id: row.resultId, status: "proposed",
        changes: this.subject.changes.parse(JSON.parse(row.resultPayloadJson)) } : null,
    }));
  }

  async send(a: Address, input: Message<F>) {
    const { resource, contract } = await this.read(this.db, a);
    const launch = requireLaunch(contract);
    for (const field of this.subject.fields) {
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
      const options = { novelId: a.novelId, taskId: a.runId, stage: this.subject.stage, entrypoint: "director_next",
        provider: contract.modelConfig.route, model: contract.modelConfig.model, temperature: launch.temperature };
      const reply = await agentReplyLive.during(input.requestId, this.subject.progress, true, itemKey =>
        runWithLlmUsageTracking({ directorNextRunId: a.runId, novelId: a.novelId, stage: options.stage }, () =>
          this.subject.generate(resource, input.draft, { storyInput: launch.storyInput, history, priorProposal, requestText: input.requestText }, { ...options, itemKey })));
      const { changes, replyText } = this.subject.reply.parse(reply);
      const edits = changes.filter(item => input.draft[item.field] !== item.value)
        .map(item => ({ ...item, before: input.draft[item.field] }));
      await this.db.$transaction(async tx => {
        const latest = await this.read(tx, a);
        if (this.subject.fields.some(field => latest.resource.base[field] !== input.base[field])) {
          throw new AppError("讨论期间资料有更新，请读取新稿再讨论。", 409);
        }
        await AgentConversationStore.complete(tx, scopeKey, input.requestId, edits.length ? input.requestId : null,
          replyText, edits.length ? JSON.stringify(edits) : undefined);
      }, { isolationLevel: "Serializable" });
    }, error => error instanceof AppError ? error.message : "本轮讨论未完成，可以用这条要求重试。");
  }

  async turnStatus(a: Address, id: string) {
    await this.read(this.db, a);
    const turn = await this.db.agentConversationTurn.findFirst({ where: { scopeKey: this.scope(a), id }, select: { status: true } });
    if (!turn) throw new AppError("找不到这条讨论。", 404);
    return turn.status;
  }

  async interrupt(a: Address, id: string) {
    await this.read(this.db, a);
    await this.store.stop(this.scope(a), id, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(id);
  }
}
