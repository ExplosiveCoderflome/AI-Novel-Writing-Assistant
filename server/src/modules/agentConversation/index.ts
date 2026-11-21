import type { Prisma, PrismaClient } from "@prisma/client";
import type { AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { AppError } from "../../middleware/errorHandler";

type Start = AgentTurnInput & { scopeKey: string; contextVersion: string };
const running = "running";
export { agentReplyLive } from "./AgentReplyLive";
export { streamAgentReply } from "./http/streamReply";

export class AgentConversationStore {
  constructor(private readonly db: PrismaClient) {}

  history(scopeKey: string) {
    return this.db.agentConversationTurn.findMany({ where: { scopeKey }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  async start(input: Start) {
    const { scopeKey, requestId: id, requestText, contextVersion } = input;
    const parentResultId = input.parentResultId ?? null;
    try {
      const turn = await this.db.agentConversationTurn.create({ data: {
        id, scopeKey, requestText, contextVersion, parentResultId, activeSlot: running, status: running,
      } });
      return { turn, created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const turn = await this.db.agentConversationTurn.findUnique({ where: { id } });
      if (turn?.scopeKey === scopeKey && turn.contextVersion === contextVersion && turn.requestText === requestText && turn.parentResultId === parentResultId) {
        return { turn, created: false };
      }
      throw new AppError("请刷新对话，查看正在处理的这一轮。", 409);
    }
  }

  /** Publish the message and its domain result in the same transaction. */
  static async complete(tx: Prisma.TransactionClient, scopeKey: string, id: string, resultId: string | null, replyText: string) {
    const changed = await tx.agentConversationTurn.updateMany({ where: { id, scopeKey, status: running },
      data: { status: "completed", activeSlot: null, resultId, replyText } });
    if (!changed.count) throw new AppError("本轮讨论已结束，请查看对话记录。", 409);
  }

  async stop(scopeKey: string, id: string, status: "failed" | "interrupted", replyText: string) {
    const changed = await this.db.agentConversationTurn.updateMany({ where: { scopeKey, id, status: running },
      data: { status, activeSlot: null, replyText } });
    if (!changed.count && status === "interrupted") throw new AppError("本轮状态已改变，请刷新对话。", 409);
  }
}
