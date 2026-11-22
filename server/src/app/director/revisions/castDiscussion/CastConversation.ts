import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { castReviewFields } from "@ai-novel/shared/types/director/revision";
import { castDraftSchema, castReplySchema, castProposalChanges, type CastProposal } from "@ai-novel/shared/types/director/castReview/discussion";
import { AppError } from "../../../../middleware/errorHandler";
import { runWithLlmUsageTracking } from "../../../../llm/usageTracking";
import { AgentConversationStore, agentReplyLive, recentAgentDiscussion } from "../../../../modules/agentConversation";
import { artifactContentHash, type RunContract } from "../../../../modules/director";
import { assertNovelDirectorVersion, readRunExecutionEpoch } from "../../../../modules/novel/director-routing";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import { castReviewDialoguePrompt, type CastDialogueInput } from "../../../../prompting/prompts/novel/character/castReviewDialogue.prompt";
import { requireLaunch } from "../../productionInputs";

const id = z.string().trim().min(1).max(160);
export const castAddressSchema = z.object({ novelId: id, runId: id, version: z.coerce.number().int().nonnegative(), characterId: id });
type Address = z.infer<typeof castAddressSchema>;
export const castMessageSchema = z.object({
  requestText: z.string().trim().min(1).max(4000), requestId: id, parentResultId: id.optional(),
  base: castDraftSchema, draft: castDraftSchema,
}).strict();
type Message = z.infer<typeof castMessageSchema>;
const scope = (a: Address) => JSON.stringify(["director-cast", a.novelId, a.runId, a.version, a.characterId]);
const gateSchema = z.object({ artifactTypes: z.tuple([z.literal("character_cast")]) });

async function readCharacter(db: Prisma.TransactionClient, a: Address) {
  const row = await db.directorNextRunControl.findUnique({ where: { runId: a.runId }, include: { run: true } });
  if (!row || row.novelId !== a.novelId || row.run.novelId !== a.novelId || row.version !== a.version ||
      row.status !== "waiting_gate" || !gateSchema.safeParse(JSON.parse(row.gateJson ?? "null")).success) {
    throw new AppError("角色阵容确认阶段已变化，请重新打开本书导演台。", 409);
  }
  const contract = JSON.parse(row.run.contractJson) as RunContract;
  if (contract.novelId !== a.novelId || contract.runId !== a.runId) throw new AppError("无法核对本书角色确认记录。", 409);
  await assertNovelDirectorVersion(a.novelId, "v2", readRunExecutionEpoch(row.run.contractJson), db);
  const person = await db.character.findFirst({ where: { novelId: a.novelId, id: a.characterId },
    select: { name: true, role: true, background: true, personality: true, storyFunction: true, currentGoal: true } });
  if (!person) throw new AppError("在本书阵容中找不到这位角色。", 404);
  return { person, contract };
}

async function generate(promptInput: CastDialogueInput, options: PromptExecutionOptions) {
  const result = await runWithLlmUsageTracking({ directorNextRunId: options.taskId, novelId: options.novelId, stage: options.stage },
    () => runStructuredPrompt({ asset: castReviewDialoguePrompt, promptInput, options }));
  return result.output;
}

export class CastConversation {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient, private readonly invoke = generate) {
    this.store = new AgentConversationStore(db);
  }

  async history(a: Address): Promise<AgentConversationTurn<CastProposal>[]> {
    await readCharacter(this.db, a);
    return (await this.store.history(scope(a))).map(row => ({
      id: row.id, requestText: row.requestText, createdAt: row.createdAt.toISOString(), replyText: row.replyText,
      parentResultId: row.parentResultId, contextVersion: row.contextVersion,
      status: z.enum(["running", "failed", "interrupted", "completed"]).parse(row.status),
      result: row.resultId && row.resultPayloadJson ? { id: row.resultId, status: "proposed",
        changes: castProposalChanges.parse(JSON.parse(row.resultPayloadJson)) } : null,
    }));
  }

  async send(a: Address, input: Message) {
    const { person, contract } = await readCharacter(this.db, a);
    const launch = requireLaunch(contract);
    for (const field of castReviewFields) {
      if ((person[field] ?? "") !== input.base[field]) throw new AppError("角色资料有更新，请重新打开阵容再讨论。", 409);
      if (input.draft[field] !== input.base[field] && input.draft[field].length > 12000) throw new AppError("每项修改最多 12000 字。", 400);
    }
    const scopeKey = scope(a);
    const previous = input.parentResultId ? await this.db.agentConversationTurn.findFirst({
      where: { scopeKey, resultId: input.parentResultId, status: "completed" }, select: { resultPayloadJson: true },
    }) : null;
    if (input.parentResultId && !previous?.resultPayloadJson) throw new AppError("请从这位角色的讨论中选择要追问的建议。", 409);
    const priorProposal = previous?.resultPayloadJson ? castProposalChanges.parse(JSON.parse(previous.resultPayloadJson)) : null;
    const contextVersion = artifactContentHash([input.base, input.draft]);
    return this.store.startReply({ ...input, scopeKey, contextVersion }, async () => {
      const [cast, relations, turns] = await Promise.all([
        this.db.character.findMany({ where: { novelId: a.novelId }, orderBy: { id: "asc" }, select: { name: true, role: true, storyFunction: true } }),
        this.db.characterRelation.findMany({ where: { novelId: a.novelId, OR: [{ sourceCharacterId: a.characterId }, { targetCharacterId: a.characterId }] },
          select: { sourceCharacter: { select: { name: true } }, targetCharacter: { select: { name: true } }, surfaceRelation: true, hiddenTension: true } }),
        this.store.history(scopeKey),
      ]);
      const promptInput: CastDialogueInput = { storyInput: launch.storyInput, character: { ...person, ...input.draft },
        cast, relations: relations.map(row => ({ source: row.sourceCharacter.name, target: row.targetCharacter.name,
          relation: row.surfaceRelation, tension: row.hiddenTension })), history: recentAgentDiscussion(turns), priorProposal, requestText: input.requestText };
      const reply = await agentReplyLive.during(input.requestId, "正在读角色设定和你的想法…", true, itemKey =>
        this.invoke(promptInput, { novelId: a.novelId, taskId: a.runId, itemKey, stage: "character_setup", entrypoint: "director_next",
          provider: contract.modelConfig.route, model: contract.modelConfig.model, temperature: launch.temperature }));
      const { changes, replyText } = castReplySchema.parse(reply);
      const edits = changes.filter(item => input.draft[item.field] !== item.value)
        .map(item => ({ ...item, before: input.draft[item.field] }));
      await this.db.$transaction(async tx => {
        const latest = await readCharacter(tx, a);
        if (castReviewFields.some(field => (latest.person[field] ?? "") !== input.base[field])) {
          throw new AppError("讨论期间角色资料有更新，请读取新稿再讨论。", 409);
        }
        await AgentConversationStore.complete(tx, scopeKey, input.requestId, edits.length ? input.requestId : null,
          replyText, edits.length ? JSON.stringify(edits) : undefined);
      }, { isolationLevel: "Serializable" });
    }, error => error instanceof AppError ? error.message : "本轮讨论未完成，可以用这条要求重试。");
  }

  async turnStatus(a: Address, id: string) {
    await readCharacter(this.db, a);
    const turn = await this.db.agentConversationTurn.findFirst({ where: { scopeKey: scope(a), id }, select: { status: true } });
    if (!turn) throw new AppError("找不到这位角色的讨论。", 404);
    return turn.status;
  }

  async interrupt(a: Address, id: string) {
    await readCharacter(this.db, a);
    await this.store.stop(scope(a), id, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(id);
  }
}
