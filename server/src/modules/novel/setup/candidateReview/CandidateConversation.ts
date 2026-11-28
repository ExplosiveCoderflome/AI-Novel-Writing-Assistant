import type { AgentConversationTurn, AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { candidateReplySchema, candidateStoryFields, savedCandidateChanges,
  type CandidateProposal, type CandidateStoryField } from "@ai-novel/shared/types/director/candidateReview";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import type { OpeningCandidateProposal, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../../../middleware/errorHandler";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { candidateDialoguePrompt, type CandidateDialogueInput } from "../../../../prompting/prompts/novel/opening/candidateDialogue.prompt";
import { AgentConversationStore, agentReplyLive, recentAgentDiscussion } from "../../../agentConversation";
import { readCandidate, saveCandidate, scopeOf, versionConflict, type CandidateAddress } from "./candidateResource";

const selectionSchema = z.array(z.enum(candidateStoryFields)).min(1)
  .refine(fields => new Set(fields).size === fields.length, "请选择不同的修改项。");
export const candidateApplyBody = z.object({ fields: selectionSchema }).strict();
type Input = AgentTurnInput & { revision: number };

async function generate(promptInput: CandidateDialogueInput, options: DirectorLLMOptions & { itemKey: string; taskId: string }) {
  const result = await runStructuredPrompt({ asset: candidateDialoguePrompt, promptInput,
    options: { ...options, stage: "auto_director", entrypoint: "auto_director_create" } });
  return result.output;
}
function project(row: OpeningCandidateProposal, stale: boolean): CandidateProposal {
  return {
    id: row.id, changes: savedCandidateChanges.parse(JSON.parse(row.changesJson)),
    appliedFields: row.appliedFieldsJson ? selectionSchema.parse(JSON.parse(row.appliedFieldsJson)) : [],
    status: row.status === "pending" && stale ? "stale" : z.enum(["pending", "superseded", "applied"]).parse(row.status),
  };
}

export class CandidateConversation {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient, private readonly invoke = generate) {
    this.store = new AgentConversationStore(db);
  }

  async history(address: CandidateAddress): Promise<AgentConversationTurn<CandidateProposal>[]> {
    const { revision } = await readCandidate(this.db, address);
    const rows = await this.db.agentConversationTurn.findMany({ where: { scopeKey: scopeOf(address) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { openingCandidateProposal: true } });
    return rows.map(({ id, requestText, replyText, contextVersion, createdAt, parentResultId, status, openingCandidateProposal }) => ({
      id, requestText, replyText, contextVersion, parentResultId, createdAt: createdAt.toISOString(),
      status: status as AgentConversationTurn<CandidateProposal>["status"], thinking: agentReplyLive.recentThinking(id, status),
      result: openingCandidateProposal ? project(openingCandidateProposal, contextVersion !== String(revision)) : null,
    }));
  }

  async send(address: CandidateAddress, input: Input) {
    const resource = await readCandidate(this.db, address);
    if (input.revision !== resource.revision) throw versionConflict();
    const scopeKey = scopeOf(address);
    const prior = input.parentResultId ? await this.db.openingCandidateProposal.findFirst({
      where: { id: input.parentResultId, turn: { scopeKey } }, include: { turn: { select: { contextVersion: true } } },
    }) : null;
    if (input.parentResultId && !prior) throw new AppError("请从这套方向的讨论中选择要追问的建议。", 409);
    const contextVersion = String(input.revision);
    const previous = prior ? project(prior, prior.turn.contextVersion !== contextVersion) : null;
    return this.store.startReply({ ...input, scopeKey, contextVersion }, () => this.answer(address, resource, input, previous),
      error => error instanceof AppError ? error.message : "本轮未取得有效建议，可以重新发送这条要求。");
  }

  private async answer(address: CandidateAddress, source: Awaited<ReturnType<typeof readCandidate>>,
    input: Input, priorProposal: CandidateProposal | null) {
    const scopeKey = scopeOf(address);
    const history = recentAgentDiscussion(await this.store.history(scopeKey));
    const { candidate, state } = source;
    const reply = await agentReplyLive.during(input.requestId, "正在阅读这套方向和你的要求…", true, itemKey =>
      this.invoke({ candidate, idea: source.batch.idea, requestText: input.requestText, history, priorProposal }, {
        provider: state.launch.provider ?? undefined, model: state.launch.model ?? undefined,
        temperature: state.launch.temperature ?? undefined, ...state.run.llmOverride, taskId: address.taskId, itemKey,
      }));
    const { changes, replyText } = candidateReplySchema.parse(reply);
    const edits = changes.filter(change => change.value !== candidate[change.field])
      .map(change => ({ ...change, before: candidate[change.field] }));
    await this.db.$transaction(async tx => {
      const latest = await readCandidate(tx, address);
      if (latest.revision !== source.revision) throw versionConflict();
      // Claim the still-running turn before creating or superseding any proposal.
      await AgentConversationStore.complete(tx, scopeKey, input.requestId, edits.length ? input.requestId : null, replyText);
      if (edits.length) {
        if (priorProposal?.status === "pending") {
          const superseded = await tx.openingCandidateProposal.updateMany({
            where: { id: priorProposal.id, status: "pending" }, data: { status: "superseded" },
          });
          if (!superseded.count) throw versionConflict();
        }
        await tx.openingCandidateProposal.create({ data: { id: input.requestId, status: "pending", changesJson: JSON.stringify(edits) } });
      }
    }, { isolationLevel: "Serializable" });
  }

  async apply(address: CandidateAddress, id: string, selection: CandidateStoryField[]) {
    const fields = selectionSchema.parse(selection).sort();
    return withSqliteRetry(() => this.db.$transaction(async tx => {
      const source = await readCandidate(tx, address);
      const row = await tx.openingCandidateProposal.findFirst({ where: { id, turn: { scopeKey: scopeOf(address) } },
        include: { turn: { select: { contextVersion: true } } } });
      if (!row) throw new AppError("找不到这套方向的建议。", 404);
      const proposal = project(row, String(source.revision) !== row.turn.contextVersion);
      if (proposal.status === "applied" && JSON.stringify(fields) === row.appliedFieldsJson) return source.candidate;
      if (proposal.status !== "pending") throw versionConflict();
      const candidate = { ...source.candidate, reviewRevision: source.revision + 1 };
      for (const field of fields) {
        const edit = proposal.changes.find(change => change.field === field);
        if (!edit || source.candidate[field] !== edit.before) throw versionConflict();
        candidate[field] = edit.value;
      }
      const saved = await tx.openingCandidateProposal.updateMany({ where: { id, status: "pending" },
        data: { status: "applied", appliedFieldsJson: JSON.stringify(fields) } });
      if (!saved.count) throw versionConflict();
      await saveCandidate(tx, address, source, candidate);
      return candidate;
    }, { isolationLevel: "Serializable" }), { label: "opening-candidate.apply" });
  }

  async interrupt(address: CandidateAddress, turnId: string) {
    await this.store.stop(scopeOf(address), turnId, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(turnId);
  }

  async streamStatus(address: CandidateAddress, id: string) {
    const turn = await this.db.agentConversationTurn.findFirst({ where: { scopeKey: scopeOf(address), id }, select: { status: true } });
    if (!turn) throw new AppError("找不到这套方向的讨论。", 404);
    return turn.status;
  }
}
