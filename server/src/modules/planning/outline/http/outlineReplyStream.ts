import type { Response } from "express";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { streamAgentReply } from "../../../agentConversation";

export async function streamOutlineReply(res: Response, projectId: string, scopeKey: string, turnId: string) {
  const [project, turn] = await Promise.all([
    prisma.outlineProject.findFirst({where: {id: projectId, status: "active"}, select: {id: true}}),
    prisma.agentConversationTurn.findFirst({where: {id: turnId, scopeKey}, select: {status: true}}),
  ]);
  if (!project || !turn) throw new AppError("找不到这轮对话。", 404);
  streamAgentReply(res, turnId, turn.status);
}
