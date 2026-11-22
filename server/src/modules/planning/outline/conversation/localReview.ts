import type { PrismaClient } from "@prisma/client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { AppError } from "../../../../middleware/errorHandler";
import { outlineChapterReviewPrompt } from "../../../../prompting/prompts/outline/chapterReview.prompt";
import { outlineVolumeReviewPrompt } from "../../../../prompting/prompts/outline/volumeReview.prompt";
import { agentReplyLive } from "../../../agentConversation";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { readWrittenChapterIds } from "../characterImpact/writtenChapters";

export type ReviewTarget = { kind: "volume" | "chapter"; id: string };
export const localReviewScope = (projectId: string, target: ReviewTarget) =>
  JSON.stringify(["outline-" + target.kind, projectId, target.id]);

export async function readLocalReviews(db: PrismaClient, projectId: string, target: ReviewTarget) {
  const project = await db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
  if (!project) throw new AppError("找不到可编辑的大纲。", 404);
  return db.$transaction(async tx => {
    const turns = await tx.agentConversationTurn.findMany({ where: { scopeKey: localReviewScope(projectId, target) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const results = await tx.outlineProposal.findMany({
      where: { projectId, kind: target.kind + "_edit", id: { in: turns.flatMap(turn => turn.resultId ? [turn.resultId] : []) } },
      select: { id: true, baseVersion: true, status: true },
    });
    const byId = new Map(results.map(row => [row.id, row]));
    return turns.map(({ id, requestText, replyText, status, createdAt, contextVersion, parentResultId, resultId }) =>
      ({ id, requestText, replyText, status, createdAt, contextVersion, parentResultId,
        thinking: agentReplyLive.recentThinking(id, status), result: resultId ? byId.get(resultId) ?? null : null }));
  });
}

interface ReviewInput {
  requestText: string;
  baseVersion: number;
  history: { author: string; assistant: string | null }[];
  priorProposal: unknown;
}

async function reviewFields(db: PrismaClient, projectId: string, target: ReviewTarget, turnId: string, document: OutlineDocument, input: ReviewInput) {
  if (target.kind === "volume") {
    const volume = document.volumes.find(item => item.nodeId === target.id);
    if (!volume) throw new AppError("当前大纲中找不到这卷。", 404);
    const result = await agentReplyLive.during(turnId, "正在对照本卷与前后卷的安排…", true, itemKey =>
      runOutlineProposalStructuredCall({ asset: outlineVolumeReviewPrompt, promptInput: { volume, document, ...input }, options: { itemKey } }));
    return { node: volume, result };
  }
  const chapter = document.chapters.find(item => item.nodeId === target.id);
  if (!chapter) throw new AppError("当前大纲中找不到这章。", 404);
  if ((await readWrittenChapterIds(db, projectId)).includes(target.id)) throw new AppError("这章已有正文，请从正文编辑页调整。", 409);
  const result = await agentReplyLive.during(turnId, "正在对照本章与前后情节…", true, itemKey =>
    runOutlineProposalStructuredCall({ asset: outlineChapterReviewPrompt, promptInput: { chapter, document, ...input }, options: { itemKey } }));
  return { node: chapter, result };
}

export async function generateLocalReview(db: PrismaClient, projectId: string, target: ReviewTarget, turnId: string, document: OutlineDocument, input: ReviewInput) {
  const { node, result } = await reviewFields(db, projectId, target, turnId, document, input);
  const current: Record<string, unknown> = node;
  const { changes, replyText } = result.output;
  const operations = changes.filter(change => change.value !== current[change.field]).map(change => ({
    operationId: change.field, kind: "update_fields" as const, nodeId: target.id, fields: { [change.field]: change.value },
    reason: change.reason, affectedNodeIds: [target.id], dependsOn: [], risks: [],
  }));
  const answer = !operations.length ? { kind: "discussion" as const }
    : target.kind === "volume" ? { kind: "volume_edit" as const, payload: { volumeId: target.id, operations } }
    : { kind: "chapter_edit" as const, payload: { chapterId: target.id, operations } };
  return { answer, replyText, invocation: result.meta.invocation };
}
