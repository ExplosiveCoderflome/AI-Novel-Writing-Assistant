import type { PrismaClient } from "@prisma/client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { AppError } from "../../../../middleware/errorHandler";
import { outlineChapterReviewPrompt } from "../../../../prompting/prompts/outline/chapterReview.prompt";
import { agentReplyLive } from "../../../agentConversation";
import { runOutlineProposalStructuredCall } from "../application/outlineProposalStructuredCall";
import { readWrittenChapterIds } from "../characterImpact/writtenChapters";

export const chapterConversationScope = (projectId: string, chapterId: string) => JSON.stringify(["outline-chapter", projectId, chapterId]);

export async function readChapterReviews(db: PrismaClient, projectId: string, chapterId: string) {
  const project = await db.outlineProject.findFirst({ where: { id: projectId, status: "active" }, select: { id: true } });
  if (!project) throw new AppError("找不到可编辑的大纲。", 404);
  return db.$transaction(async tx => {
    const turns = await tx.agentConversationTurn.findMany({ where: { scopeKey: chapterConversationScope(projectId, chapterId) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const results = await tx.outlineProposal.findMany({
      where: { projectId, kind: "chapter_edit", id: { in: turns.flatMap(turn => turn.resultId ? [turn.resultId] : []) } },
      select: { id: true, baseVersion: true, status: true },
    });
    const byId = new Map(results.map(row => [row.id, row]));
    return turns.map(({ id, requestText, replyText, status, createdAt, contextVersion, parentResultId, resultId }) =>
      ({ id, requestText, replyText, status, createdAt, contextVersion, parentResultId,
        thinking: agentReplyLive.recentThinking(id, status), result: resultId ? byId.get(resultId) ?? null : null }));
  });
}

export async function generateChapterReview(db: PrismaClient, projectId: string, chapterId: string, turnId: string,
  document: OutlineDocument, input: { requestText: string; baseVersion: number; history: {author: string; assistant: string | null}[]; priorProposal: unknown }) {
  const chapter = document.chapters.find(item => item.nodeId === chapterId);
  if (!chapter) throw new AppError("当前大纲中找不到这章。", 404);
  if ((await readWrittenChapterIds(db, projectId)).includes(chapterId)) throw new AppError("这章已有正文，请从正文编辑页调整。", 409);
  const result = await agentReplyLive.during(turnId, "正在对照本章与前后情节…", true, itemKey =>
    runOutlineProposalStructuredCall({ asset: outlineChapterReviewPrompt, promptInput: { chapter, document, ...input }, options: { itemKey } }));
  const { changes, replyText } = result.output;
  const operations = changes.filter(change => change.value !== chapter[change.field]).map(change => ({
    operationId: change.field, kind: "update_fields" as const, nodeId: chapterId, fields: { [change.field]: change.value },
    reason: change.reason, affectedNodeIds: [chapterId], dependsOn: [], risks: [],
  }));
  const answer = operations.length ? { kind: "chapter_edit" as const, payload: { chapterId, operations } } : { kind: "discussion" as const };
  return { answer, replyText, invocation: result.meta.invocation };
}
