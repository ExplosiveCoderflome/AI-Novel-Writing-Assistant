/** A turn belongs to one workbench resource. The host supplies its own result and review UI. */
export type AgentTurnStatus = "running" | "completed" | "failed" | "interrupted";

/** One model call's transient reasoning, grouped by the workbench's review stage. */
export interface AgentThinkingStep {
  stage: string;
  text: string;
  enabled?: boolean;
  reasoningTokens?: number;
}

export interface AgentConversationTurn<Result> {
  thinking?: AgentThinkingStep[];
  id: string;
  createdAt: string;
  requestText: string;
  replyText: string | null;
  status: AgentTurnStatus;
  contextVersion: string;
  parentResultId: string | null;
  result: Result | null;
}

/** Temporary text visible to the author. Only the saved turn can carry an actionable result. */
export interface AgentReplyPreview {
  thinking?: AgentThinkingStep[];
  turnId: string;
  stage: string;
  text: string;
  done: boolean;
}

export interface AgentTurnInput {
  requestId: string;
  requestText: string;
  parentResultId?: string;
}
