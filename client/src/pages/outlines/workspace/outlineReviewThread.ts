import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { apiClient } from "@/api/client";

export type LocalTarget = { kind: "character" | "chapter" | "volume"; id: string };
export type ReviewTurn = AgentConversationTurn<{ id: string; baseVersion: number; status: string }>;
const inline = { errorPresentation: "inline" } as const;
export function outlineReviewThread(projectId: string, target?: LocalTarget) {
  const personId = target?.kind === "character" ? target.id : undefined;
  const resource = personId ? "/character-impact" : target ? `/${target.kind}s/${encodeURIComponent(target.id)}` : "";
  const url = "/outlines/" + encodeURIComponent(projectId) + resource + "/conversation";
  const params = personId ? { characterId: personId } : undefined;
  const queryKey = target ? ["agent-conversation", "outline-" + target.kind, projectId, target.id] : ["agent-conversation", "outline-workbench", projectId];
  return {
    queryKey,
    load: async () => (await apiClient.get(url, { ...inline, params })).data.data as ReviewTurn[],
    send: async (requestId: string, input: { requestText: string; baseVersion: number; action?: "generate_initial" }, priorId?: string) => {
      const parent = personId ? { characterId: personId, priorProposalId: priorId } : { parentResultId: priorId };
      return (await apiClient.post(url + "/turns", { ...input, ...parent, requestId }, inline)).data.data.turnId as string;
    },
    interrupt: (turnId: string) => apiClient.post(url + "/interrupt", { ...params, turnId }, inline),
    streamUrl: (turnId: string) => apiClient.getUri({ url: url + "/turns/" + encodeURIComponent(turnId) + "/stream", params }),
  };
}
