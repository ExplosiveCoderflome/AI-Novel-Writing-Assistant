import type { AgentConversationTurn } from "./turn";

export interface OutlineConversationResult {
  id: string;
  baseVersion: number;
  status: string;
  kind: "edit" | "initial_generation";
}
export type OutlineConversationTurn = AgentConversationTurn<OutlineConversationResult>;
