import { localReviewScope, generateLocalReview, type ReviewTarget } from "./localReview";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { OutlineConversationResult, OutlineConversationTurn } from "@ai-novel/shared/types/agentConversation/outline";
import type { AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { AgentConversationStore, agentReplyLive, recentAgentDiscussion } from "../../../agentConversation";
import { AppError } from "../../../../middleware/errorHandler";
import { outlineWorkbenchDialogue } from "../../../../prompting/prompts/outline/workbenchDialogue.prompt";
import { outlineInitialGeneratePrompt } from "../../../../prompting/prompts/outline/outline.prompts";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { mapOutlineGenerateFailure } from "../application/OutlineProposalService";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { assertValidOutlineEditOperations } from "../domain/outlineEditOperations";
import { OutlineRepository } from "../infrastructure/OutlineRepository";

type Input = AgentTurnInput & { baseVersion: number; target?: ReviewTarget; action?: "generate_initial" };
export const outlineConversationScope = (id: string) => JSON.stringify(["outline-workbench", id]);
const scopeFor = (projectId: string, target?: ReviewTarget) => target ? localReviewScope(projectId, target) : outlineConversationScope(projectId);
const kinds = ["initial_generation", "edit"];
const conflict = () => new AppError("大纲或提案已有更新，请根据最新版本继续讨论。", 409);

function summarizeDraft(json: string): OutlineConversationResult["draftSummary"] {
  try {
    const draft = JSON.parse(json);
    const title = draft?.storyFields?.title;
    if (typeof title === "string" && title.trim() && Array.isArray(draft.volumes)
      && Array.isArray(draft.chapters) && Array.isArray(draft.characters)) {
      return { title, volumeCount: draft.volumes.length, chapterCount: draft.chapters.length, characterCount: draft.characters.length };
    }
  } catch { /* Older unreadable proposals still have a place in the conversation history. */ }
}

export class OutlineWorkbenchConversation {
  private readonly store: AgentConversationStore;
  constructor(private readonly db: PrismaClient) { this.store = new AgentConversationStore(db); }

  async read(projectId: string): Promise<OutlineConversationTurn[]> {
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const metadata = { id: true, kind: true, status: true, baseVersion: true, createdAt: true, requestText: true } as const;
    const [rows, edits, drafts, revisions] = await this.db.$transaction([
      this.store.history(outlineConversationScope(projectId)),
      this.db.outlineProposal.findMany({ where: { projectId, kind: "edit" }, select: metadata }),
      this.db.outlineProposal.findMany({ where: { projectId, kind: "initial_generation" }, select: { ...metadata, proposalJson: true } }),
      this.db.outlineRevision.findMany({ where: { projectId, sourceType: { in: ["proposal", "initial_generation"] }, sourceProposalId: { not: null } },
        select: { sourceProposalId: true, version: true } }),
    ], { isolationLevel: "Serializable" });
    const adoptedVersions = new Map(revisions.map(row => [row.sourceProposalId, row.version]));
    const summaries = new Map(drafts.map(row => [row.id, summarizeDraft(row.proposalJson)]));
    const proposals = [...edits, ...drafts];
    const results = new Map<string, OutlineConversationResult>(proposals.map(row => [row.id, {
      id: row.id, status: row.status, baseVersion: row.baseVersion, kind: row.kind as OutlineConversationResult["kind"],
      draftSummary: summaries.get(row.id), adoptedVersion: adoptedVersions.get(row.id),
    }]));
    const turns: OutlineConversationTurn[] = rows.map(row => ({ id: row.id, requestText: row.requestText,
      createdAt: row.createdAt.toISOString(), contextVersion: row.contextVersion, status: row.status as OutlineConversationTurn["status"],
      thinking: agentReplyLive.recentThinking(row.id, row.status), replyText: row.replyText, parentResultId: row.parentResultId, result: results.get(row.resultId ?? "") ?? null }));
    const linked = new Set(rows.map(row => row.resultId));
    for (const row of proposals) if (!linked.has(row.id)) turns.push({
      id: row.id, requestText: row.requestText ?? "", createdAt: row.createdAt.toISOString(), contextVersion: String(row.baseVersion),
      status: "completed", replyText: null,
      parentResultId: null, result: results.get(row.id)!,
    });
    return turns.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async send(projectId: string, input: Input) {
    const project = await this.db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
    if (!project) throw new AppError("找不到可编辑的大纲。", 404);
    const scopeKey = scopeFor(projectId, input.target);
    return this.store.startReply({ ...input, scopeKey, contextVersion: String(input.baseVersion) },
      () => this.generate(projectId, input), error => {
      const mapped = mapOutlineGenerateFailure(error, "edit");
      return mapped instanceof AppError ? mapped.message : "本轮未能生成回复，可以重新发送这条要求。";
    });
  }

  private async generate(projectId: string, input: Input) {
    const current = await new OutlineRepository(this.db).getCurrent(projectId);
    if (!current?.revision || current.project.currentVersion !== input.baseVersion || current.project.status !== "active") throw conflict();
    const document = validateOutlineDocument(JSON.parse(current.revision.documentJson));
    const target = input.target;
    const prior = input.parentResultId ? await this.db.outlineProposal.findFirst({
      where: { id: input.parentResultId, projectId, kind: { in: target ? [target.kind + "_edit"] : kinds }, status: { in: ["pending", "applied", "partially_applied"] } },
    }) : null;
    if (input.parentResultId && !prior) throw conflict();
    const scopeKey = scopeFor(projectId, target);
    const rows = await this.store.history(scopeKey);
    const history = recentAgentDiscussion(rows);
    const priorProposal = prior && { kind: prior.kind, status: prior.status, baseVersion: prior.baseVersion, requestText: prior.requestText, payload: JSON.parse(prior.proposalJson) };
    if (target && priorProposal && priorProposal.payload[target.kind + "Id"] !== target.id) throw conflict();
    const { answer, invocation, replyText } = target
      ? await generateLocalReview(this.db, projectId, target, input.requestId, document, { requestText: input.requestText, baseVersion: input.baseVersion, history, priorProposal })
      : await this.generateWhole(input, document, history, priorProposal);
    if (answer.kind === "edit" || answer.kind === "chapter_edit" || answer.kind === "volume_edit") assertValidOutlineEditOperations(answer.payload.operations, { document });
    await this.db.$transaction(async tx => {
      const latest = await tx.outlineProject.findUniqueOrThrow({ where: { id: projectId }, select: { updatedAt: true } });
      const guard = await tx.outlineProject.updateMany({ where: { id: projectId, status: "active", currentVersion: input.baseVersion },
        data: { currentVersion: { increment: 0 }, updatedAt: latest.updatedAt } });
      if (!guard.count) throw conflict();
      let resultId: string | null = null;
      if (answer.kind !== "discussion") {
        if (prior?.status === "pending" && (!target || prior.baseVersion === input.baseVersion)) {
          const changed = await tx.outlineProposal.updateMany({ where: { id: prior.id, projectId, status: "pending" }, data: { status: "superseded" } });
          if (!changed.count) throw conflict();
        }
        resultId = randomUUID();
        await tx.outlineProposal.create({ data: { id: resultId, projectId, baseVersion: input.baseVersion, kind: answer.kind, status: "pending",
          requestText: input.requestText, proposalJson: JSON.stringify(answer.payload), promptId: invocation?.promptId, promptVersion: invocation?.promptVersion } });
      }
      await AgentConversationStore.complete(tx, scopeKey, input.requestId, resultId, replyText);
    });
  }

  private async generateWhole(input: Input, document: OutlineDocument, history: {author: string; assistant: string | null}[],
    priorProposal: { kind: string; status: string; payload: unknown } | null) {
    const dialogue = input.action === "generate_initial" ? null : await agentReplyLive.during(input.requestId, "大纲助手正在回复…", true, itemKey =>
      runOutlineProposalStructuredCall({ asset: outlineWorkbenchDialogue, options: {itemKey},
        promptInput: { requestText: input.requestText, baseVersion: input.baseVersion, document, history, priorProposal } }));
    let answer: NonNullable<typeof dialogue>["output"]["answer"] = dialogue?.output.answer ?? { kind: "initial_generation", payload: null };
    let replyText = dialogue?.output.replyText ?? "";
    let invocation = dialogue?.meta.invocation;
    if (answer.kind === "initial_generation" && !answer.payload) {
      const draft = await agentReplyLive.during(input.requestId, "正在根据讨论生成完整初稿…", false, itemKey =>
        runOutlineProposalStructuredCall({
          // This is already the contextual regeneration. A context-free repair cannot supply a missing story.
          asset: { ...outlineInitialGeneratePrompt, repairPolicy: { maxAttempts: 0 } }, options: { itemKey },
          promptInput: { idea: input.requestText, rough: true, conversation: { document, history, priorProposal, draftDirection: replyText } },
        })).catch(error => { throw mapOutlineGenerateFailure(error, "initial_generation"); });
      answer = { kind: "initial_generation", payload: draft.output };
      invocation = draft.meta.invocation;
      replyText = "";
    }
    if (!replyText && answer.kind === "initial_generation" && answer.payload) {
      replyText = `《${answer.payload.storyFields.title}》的初稿已整理好，你可以查看卷章、人物和伏笔，再决定是否采纳。`;
    }
    return { answer, invocation, replyText };
  }

  async interrupt(projectId: string, turnId: string, target?: ReviewTarget) {
    await this.store.stop(scopeFor(projectId, target), turnId, "interrupted", "本轮讨论已结束。");
    agentReplyLive.end(turnId);
  }
}
