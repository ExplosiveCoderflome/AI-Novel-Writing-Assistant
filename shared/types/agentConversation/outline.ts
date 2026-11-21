import type { AgentConversationTurn } from "./turn";

export interface OutlineConversationResult {
  id: string;
  baseVersion: number;
  status: string;
  kind: "edit" | "initial_generation";
  draftSummary?: { title: string; volumeCount: number; chapterCount: number; characterCount: number };
  adoptedVersion?: number;
}
export type OutlineConversationTurn = AgentConversationTurn<OutlineConversationResult>;
