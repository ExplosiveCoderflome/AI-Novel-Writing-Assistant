import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { ImpactConversationTurn, ImpactResultRef } from "@ai-novel/shared/types/outlineCharacterImpact";
import { apiClient } from "@/api/client";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { findOutlineNodeTitle } from "../outlineNodes";

type Props = {
  projectId: string;
  version: number;
  characterId: string;
  document: OutlineDocument;
  dirty: boolean;
  newTopic: boolean;
  requestText: string;
  onRequestChange: (text: string) => void;
  onSent: (turnId: string) => void;
  onOpenResult: (id: string) => void;
};

const labels: Record<string, string> = {
  pending: "待确认", applied: "已采纳", partially_applied: "部分采纳", rejected: "已结束", superseded: "已有后续提案",
};

export function CharacterImpactPanel({ projectId, version, characterId, document, dirty, newTopic, requestText, onRequestChange, onSent, onOpenResult }: Props) {
  const name = findOutlineNodeTitle(document, characterId);
  const queryKey = ["agent-conversation", "outline-character", projectId, characterId];
  const url = `/outlines/${projectId}/character-impact/conversation`;
  const inline = { errorPresentation: "inline" } as const;
  const adapter: AgentConversationAdapter<ImpactResultRef> = {
    queryKey,
    streamUrl: turnId => apiClient.getUri({url: url + "/turns/" + encodeURIComponent(turnId) + "/stream", params: {characterId}}),
    load: async () => (await apiClient.get(url, { params: { characterId }, ...inline })).data.data as ImpactConversationTurn[],
    send: async ({ requestId, requestText, parentResultId }) => {
      const response = await apiClient.post(url + "/turns", { requestId, characterId, baseVersion: version, requestText, priorProposalId: parentResultId }, inline);
      onSent(response.data.data.turnId);
    },
    interrupt: turnId => apiClient.post(url + "/interrupt", { characterId, turnId }, inline),
  };
  const editable = (r: ImpactResultRef) => r.baseVersion === version && r.status === "pending";
  return <div aria-label="人物联动审阅" className="outline-conversation-host">
    <AgentConversation adapter={adapter} newTopic={newTopic ? `修改${name} · 当前稿 v${version}` : undefined} confirmationHint="由你确认后写入大纲" title="人物搭档" context={`${findOutlineNodeTitle(document, characterId)}的故事线 · 修订 v${version}`}
      welcome={{ title: `想让${findOutlineNodeTitle(document, characterId)}怎么变？`, body: "从动机、关系或一次选择说起。我会对照涉及的卷章与伏笔，帮你看清哪些地方需要一起改。",
        starters: [{ label: "先梳理人物牵动的情节", text: "先帮我梳理这个人物牵动了哪些卷章和伏笔，解释它们的联系。" },
          { label: "一起推敲人物的动机", text: "请读一下这个人物的动机和关键选择，和我讨论哪里可以更有说服力。" }] }}
      inputLabel="希望人物怎么变？哪些情节要保留？" placeholder={`例如，丰富一下${name}的目标和动机。`}
      followUpPlaceholder="想改一处人物动机，还是追问某个出场安排？"
      initialAction="分析相关卷章与伏笔" disabled={dirty} maxLength={6000} value={requestText} onChange={onRequestChange}
      versionLabel={value => `大纲 v${value}`}
      followUpTopic={() => `正在讨论「${findOutlineNodeTitle(document, characterId)}」的人物调整`}
      followUpAction={(result, n) => editable(result) ? `继续讨论第 ${n} 轮提案` : `按当前大纲重审第 ${n} 轮`}
      canContinue={r => ["pending", "applied", "partially_applied"].includes(r.status)} describeResult={r => r.status === "pending" && r.baseVersion !== version ? "大纲有新修订" : labels[r.status] ?? "已结束"}
      onOpenResult={onOpenResult} />
  </div>;
}
