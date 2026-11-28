import type { Prisma, PrismaClient } from "@prisma/client";
import type { AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { AppError } from "../../middleware/errorHandler";
import { agentReplyLive } from "./AgentReplyLive";

type Start = AgentTurnInput & { scopeKey: string; contextVersion: string };
const running = "running";
export { agentReplyLive };
export { streamAgentReply } from "./http/streamReply";
export { recentAgentDiscussion } from "./discussionHistory";

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

  /** Persist before dispatch. A replay returns the original receipt without a second model call. */
  async startReply(input: Start, answer: () => Promise<void>, failureMessage: (error: unknown) => string) {
    const { turn, created } = await this.start(input);
    if (created) {
      agentReplyLive.begin(turn.id);
      void answer().catch(error => this.stop(input.scopeKey, turn.id, "failed", failureMessage(error)))
        .catch(error => console.error("[agent-conversation] failed to close turn", turn.id, error))
        .finally(() => agentReplyLive.end(turn.id));
    }
    return { turnId: turn.id };
  }

  /** Publish the message and its domain result in the same transaction. */
  static async complete(tx: Prisma.TransactionClient, scopeKey: string, id: string, resultId: string | null, replyText: string, resultPayloadJson?: string) {
    const changed = await tx.agentConversationTurn.updateMany({ where: { id, scopeKey, status: running },
      data: { status: "completed", activeSlot: null, resultId, replyText, resultPayloadJson } });
    if (!changed.count) throw new AppError("本轮讨论已结束，请查看对话记录。", 409);
  }

  async stop(scopeKey: string, id: string, status: "failed" | "interrupted", replyText: string) {
    const changed = await this.db.agentConversationTurn.updateMany({ where: { scopeKey, id, status: running },
      data: { status, activeSlot: null, replyText } });
    if (!changed.count && status === "interrupted") throw new AppError("本轮状态已改变，请刷新对话。", 409);
  }
}
