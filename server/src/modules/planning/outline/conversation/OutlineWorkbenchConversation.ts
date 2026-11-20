import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { OutlineConversationResult, OutlineConversationTurn } from "@ai-novel/shared/types/agentConversation/outline";
import type { AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { AgentConversationStore, agentReplyLive } from "../../../agentConversation";
import { AppError } from "../../../../middleware/errorHandler";
import { outlineWorkbenchDialogue } from "../../../../prompting/prompts/outline/workbenchDialogue.prompt";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { mapOutlineGenerateFailure } from "../application/OutlineProposalService";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { assertValidOutlineEditOperations } from "../domain/outlineEditOperations";
import { OutlineRepository } from "../infrastructure/OutlineRepository";

type Input = AgentTurnInput & { baseVersion: number };
export const outlineConversationScope = (id: string) => JSON.stringify(["outline-workbench", id]);
const kinds = ["initial_generation", "edit"];
const conflict = () => new AppError("大纲或提案已有更新，请根据最新版本继续讨论。", 409);

export class OutlineWorkbenchConversation {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient) { this.store = new AgentConversationStore(db); }

  async read(projectId: string): Promise<OutlineConversationTurn[]> {
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const [rows, proposals] = await this.db.$transaction([
      this.store.history(outlineConversationScope(projectId)),
      this.db.outlineProposal.findMany({ where: { projectId, kind: { in: kinds } },
        select: { id: true, kind: true, status: true, baseVersion: true, createdAt: true, requestText: true } }),
    ], { isolationLevel: "Serializable" });
    const results = new Map<string, OutlineConversationResult>(proposals.map(row => [row.id, {
      id: row.id, status: row.status, baseVersion: row.baseVersion, kind: row.kind as OutlineConversationResult["kind"],
    }]));
    const turns: OutlineConversationTurn[] = rows.map(row => ({ id: row.id, requestText: row.requestText,
      createdAt: row.createdAt.toISOString(), contextVersion: row.contextVersion, status: row.status as OutlineConversationTurn["status"],
      thinking: agentReplyLive.recentThinking(row.id, row.status), replyText: row.replyText, parentResultId: row.parentResultId, result: results.get(row.resultId ?? "") ?? null }));
    const linked = new Set(rows.map(row => row.resultId));
    for (const row of proposals) if (!linked.has(row.id)) turns.push({
      id: row.id, requestText: row.requestText ?? "", createdAt: row.createdAt.toISOString(), contextVersion: String(row.baseVersion),
      status: "completed", replyText: row.kind === "edit" ? "这是一份大纲修改建议。" : "这是一份大纲初稿。",
      parentResultId: null, result: results.get(row.id)!,
    });
    return turns.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async send(projectId: string, input: Input) {
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const scopeKey = outlineConversationScope(projectId);
    const { turn, created } = await this.store.start({ ...input, scopeKey, contextVersion: String(input.baseVersion) });
    if (!created) return { turnId: turn.id };
    agentReplyLive.begin(turn.id);
    void this.generate(projectId, input).catch(async error => {
      const mapped = mapOutlineGenerateFailure(error, "edit");
      await this.store.stop(scopeKey, turn.id, "failed", mapped instanceof AppError ? mapped.message : "本轮未能生成回复，可以重新发送这条要求。");
    }).catch(error => console.error("[outline-conversation] failed to record turn", turn.id, error)).finally(() => agentReplyLive.end(turn.id));
    return { turnId: turn.id };
  }

  private async generate(projectId: string, input: Input) {
    const current = await new OutlineRepository(this.db).getCurrent(projectId);
    if (!current?.revision || current.project.currentVersion !== input.baseVersion || current.project.status !== "active") throw conflict();
    const document = validateOutlineDocument(JSON.parse(current.revision.documentJson));
    const prior = input.parentResultId ? await this.db.outlineProposal.findFirst({
      where: { id: input.parentResultId, projectId, kind: { in: kinds }, status: { in: ["pending", "applied", "partially_applied"] } },
    }) : null;
    if (input.parentResultId && !prior) throw conflict();
    const rows = await this.store.history(outlineConversationScope(projectId));
    const history: { author: string; assistant: string | null }[] = [];
    let remaining = 12000;
    for (const row of rows.reverse()) {
      if (row.status !== "completed") continue;
      const author = row.requestText.slice(0, remaining);
      const assistant = row.replyText?.slice(0, remaining - author.length) ?? null;
      history.unshift({ author, assistant });
      remaining -= author.length + (assistant?.length ?? 0);
      if (!remaining) break;
    }
    const { output, meta } = await agentReplyLive.during(input.requestId, "大纲搭档正在回复…", true, itemKey =>
      runOutlineProposalStructuredCall({ asset: outlineWorkbenchDialogue, options: {itemKey}, promptInput: {
        requestText: input.requestText, baseVersion: input.baseVersion, document, history,
        priorProposal: prior && { kind: prior.kind, status: prior.status, payload: JSON.parse(prior.proposalJson) },
      } }));
    const answer = output.answer;
    if (answer.kind === "edit") assertValidOutlineEditOperations(answer.payload.operations, { document });
    if (answer.kind === "initial_generation") {
      const { volumes, chapters, characters, payoffs, facts } = answer.payload;
      const refs = [...volumes, ...chapters, ...characters, ...payoffs, ...facts].map(node => node.clientRef);
      const parents = new Set(volumes.map(v => v.clientRef));
      if (new Set(refs).size !== refs.length || chapters.some(chapter => !parents.has(chapter.volumeRef))) {
        throw new AppError("初稿的卷章引用不完整，请重新生成。", 422);
      }
    }
    await this.db.$transaction(async tx => {
      const latest = await tx.outlineProject.findUniqueOrThrow({ where: { id: projectId }, select: { updatedAt: true } });
      const guard = await tx.outlineProject.updateMany({ where: { id: projectId, status: "active", currentVersion: input.baseVersion },
        data: { currentVersion: { increment: 0 }, updatedAt: latest.updatedAt } });
      if (!guard.count) throw conflict();
      let resultId: string | null = null;
      if (answer.kind !== "discussion") {
        if (prior?.status === "pending") {
          const changed = await tx.outlineProposal.updateMany({ where: { id: prior.id, projectId, status: "pending" }, data: { status: "superseded" } });
          if (!changed.count) throw conflict();
        }
        resultId = randomUUID();
        await tx.outlineProposal.create({ data: { id: resultId, projectId, baseVersion: input.baseVersion, kind: answer.kind, status: "pending",
          requestText: input.requestText, proposalJson: JSON.stringify(answer.payload), promptId: meta.invocation.promptId, promptVersion: meta.invocation.promptVersion } });
      }
      await AgentConversationStore.complete(tx, outlineConversationScope(projectId), input.requestId, resultId, output.replyText);
    });
  }

  async interrupt(projectId: string, turnId: string) {
    await this.store.stop(outlineConversationScope(projectId), turnId, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(turnId);
  }
}
