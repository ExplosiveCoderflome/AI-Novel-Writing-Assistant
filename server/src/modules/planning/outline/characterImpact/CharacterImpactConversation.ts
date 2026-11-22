import type { PrismaClient } from "@prisma/client";
import type { ImpactConversationTurn, ImpactRequest, ImpactResultRef } from "@ai-novel/shared/types/outlineCharacterImpact";
import { AgentConversationStore, agentReplyLive } from "../../../agentConversation";
import { AppError } from "../../../../middleware/errorHandler";
import { CharacterImpactService } from "./CharacterImpactService";

export const characterConversationScope = (projectId: string, characterId: string) => JSON.stringify(["outline-character", projectId, characterId]);
type Input = ImpactRequest & { requestId: string; priorProposalId?: string };

export class CharacterImpactConversation {
  private readonly turns: AgentConversationStore;
  constructor(private readonly db: PrismaClient, private readonly impact: CharacterImpactService) {
    this.turns = new AgentConversationStore(db);
  }

  async read(projectId: string, characterId: string): Promise<ImpactConversationTurn[]> {
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const metadata = { id: true, status: true, baseVersion: true, createdAt: true, requestText: true, promptId: true } as const;
    const where = { projectId, kind: "character_impact" };
    const [rows, indexed, unindexed] = await this.db.$transaction([
      this.turns.history(characterConversationScope(projectId, characterId)),
      this.db.outlineProposal.findMany({ where: { ...where, characterNodeId: characterId }, select: metadata }),
      this.db.outlineProposal.findMany({ where: { ...where, characterNodeId: null }, select: { ...metadata, proposalJson: true } }),
    ], { isolationLevel: "Serializable" });
    // Pre-conversation proposals stored the character only inside their validated payload.
    const proposals = [...indexed, ...unindexed.filter(row => JSON.parse(row.proposalJson).impact.characterId === characterId)];
    const ownedResults = new Set(rows.map(turn => turn.resultId));
    const results = new Map<string, ImpactResultRef>();
    const legacy: ImpactConversationTurn[] = [];
    for (const row of proposals) {
      const result: ImpactResultRef = { id: row.id, status: row.status, baseVersion: row.baseVersion, source: row.promptId ? "workbench" : "external" };
      results.set(row.id, result);
      if (!ownedResults.has(row.id)) legacy.push({ id: row.id, createdAt: row.createdAt.toISOString(),
        requestText: row.requestText ?? "", replyText: result.source === "external" ? "接入工具提交了一份人物修改提案。" : "生成人物修改提案。",
        status: "completed", contextVersion: String(row.baseVersion), parentResultId: null, result });
    }
    const turns: ImpactConversationTurn[] = rows.map(row => ({
      id: row.id, createdAt: row.createdAt.toISOString(), status: row.status as ImpactConversationTurn["status"],
      requestText: row.requestText, thinking: agentReplyLive.recentThinking(row.id, row.status), replyText: row.replyText, contextVersion: row.contextVersion, parentResultId: row.parentResultId,
      result: row.resultId ? results.get(row.resultId) ?? null : null,
    }));
    return [...legacy, ...turns].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async send(projectId: string, input: Input) {
    const scopeKey = characterConversationScope(projectId, input.characterId);
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const { turn, created } = await this.turns.start({ scopeKey, requestId: input.requestId, requestText: input.requestText,
      contextVersion: String(input.baseVersion), parentResultId: input.priorProposalId });
    if (!created) return { turnId: turn.id };
    agentReplyLive.begin(turn.id);
    void this.generate(projectId, scopeKey, input).catch(error => {
      console.error("[character-impact] failed to record conversation error", turn.id, error);
    }).finally(() => agentReplyLive.end(turn.id));
    return { turnId: turn.id };
  }

  private async generate(projectId: string, scopeKey: string, input: Input) {
    try {
      const rows = (await this.turns.history(scopeKey)).filter(row => row.status === "completed");
      const results = new Map(rows.filter(row => row.resultId).map(row => [row.resultId!, row]));
      const ancestry = new Set<string | null>([null]);
      let parent = input.priorProposalId;
      while (parent && !ancestry.has(parent)) {
        ancestry.add(parent);
        parent = results.get(parent)?.parentResultId ?? undefined;
      }
      const conversationHistory: {author: string; assistant: string | null}[] = [];
      let budget = 12000;
      for (const row of rows.reverse()) {
        if (!ancestry.has(row.resultId ?? row.parentResultId)) continue;
        if (!row.resultId && !row.parentResultId && row.contextVersion !== String(input.baseVersion)) continue;
        const author = row.requestText.slice(0, budget);
        const assistant = row.replyText?.slice(0, budget - author.length) ?? null;
        conversationHistory.unshift({author, assistant});
        budget -= author.length + (assistant?.length ?? 0);
        if (!budget) break;
      }
      const legacyRoot = [...ancestry].find(id => id && !results.has(id));
      if (budget > 0 && legacyRoot) {
        const original = await this.db.outlineProposal.findFirst({ where: { projectId, id: legacyRoot, kind: "character_impact" },
          select: { requestText: true, proposalJson: true } });
        if (original?.requestText && JSON.parse(original.proposalJson).impact.characterId === input.characterId) {
          conversationHistory.unshift({author: original.requestText.slice(0, budget), assistant: null});
        }
      }
      await this.impact.generate(projectId, input, { scopeKey, turnId: input.requestId, priorProposalId: input.priorProposalId, conversationHistory });
    } catch (error) {
      const message = error instanceof AppError ? error.message : "本轮生成失败。可以重新发送要求，继续讨论上一份提案。";
      await this.turns.stop(scopeKey, input.requestId, "failed", message);
    }
  }

  async interrupt(projectId: string, characterId: string, id: string) {
    await this.turns.stop(characterConversationScope(projectId, characterId), id, "interrupted", "本轮讨论已结束，未生成新提案。");
    agentReplyLive.end(id);
  }
}
