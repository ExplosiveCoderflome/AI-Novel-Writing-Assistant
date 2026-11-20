import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { ImpactConversationTurn, ImpactResultRef, ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";
import { apiClient } from "@/api/client";
import { applyOutlineProposal, type OutlineEditProposalPayload, type OutlineProposal } from "@/api/outlines";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { OutlineProposalPanel } from "../OutlineProposalPanel";
import { findOutlineNodeTitle } from "../outlineNodes";

type Props = {
  projectId: string;
  version: number;
  characterId: string;
  document: OutlineDocument;
  dirty: boolean;
  requestText: string;
  onRequestChange: (text: string) => void;
  onApplied: () => Promise<void>;
  onDiscuss: () => void;
};

const labels: Record<string, string> = {
  pending: "待确认", applied: "已采纳", partially_applied: "部分采纳", rejected: "已结束", superseded: "已有后续提案",
};

function ImpactProposal({ projectId, characterId, result, document, busy, dirty, editable, onDecision }: {
  projectId: string; characterId: string; result: ImpactResultRef; document: OutlineDocument; busy: boolean; dirty: boolean; editable: boolean;
  onDecision: (id: string, selection?: string[]) => void;
}) {
  const detail = useQuery({
    queryKey: ["outline-impact-detail", projectId, result.id, result.status],
    queryFn: async () => (await apiClient.get(`/outlines/${projectId}/proposals/${result.id}`)).data.data as OutlineProposal | null,
  });
  if (detail.isLoading) return <p role="status">正在读取提案…</p>;
  const proposal = detail.data;
  if (!proposal || proposal.kind !== "character_impact" || proposal.projectId !== projectId) return <p role="alert">未能读取这份提案。<button className="underline" onClick={() => void detail.refetch()}>重试</button></p>;
  const payload = JSON.parse(proposal.proposalJson) as OutlineEditProposalPayload & { impact: ImpactSummary };
  if (payload.impact.characterId !== characterId) return <p role="alert">这份提案属于其他人物。</p>;
  return <OutlineProposalPanel proposal={proposal} document={document} isApplying={busy} applyDisabled={dirty}
    readOnly={!editable || proposal.status !== "pending"} appliedIds={payload.impact.appliedOperationIds}
    onApply={ids => onDecision(proposal.id, ids)} onDiscard={() => onDecision(proposal.id)}
    renderContext={base => <>
      {payload.impact.writtenChapterIds.length > 0 && <details className="text-sm"><summary>已有正文的章节（仅供核对）</summary>
        <p>{payload.impact.writtenChapterIds.map(id => findOutlineNodeTitle(base, id)).join("、")}</p></details>}
      {payload.impact.retained.length > 0 && <div className="space-y-1 text-sm"><h4 className="font-medium">建议保留</h4>
        <ul className="list-disc space-y-1 pl-5">{payload.impact.retained.map((item, i) =>
          <li key={i}>{findOutlineNodeTitle(base, item.nodeId)} · {item.reason}</li>)}</ul></div>}
    </>} />;
}

export function CharacterImpactPanel({ projectId, version, characterId, document, dirty, requestText, onRequestChange, onApplied, onDiscuss }: Props) {
  const queries = useQueryClient();
  const queryKey = ["agent-conversation", "outline-character", projectId, characterId];
  const url = `/outlines/${projectId}/character-impact/conversation`;
  const inline = { errorPresentation: "inline" } as const;
  const adapter: AgentConversationAdapter<ImpactResultRef> = {
    queryKey,
    streamUrl: turnId => apiClient.getUri({url: url + "/turns/" + encodeURIComponent(turnId) + "/stream", params: {characterId}}),
    load: async () => (await apiClient.get(url, { params: { characterId }, ...inline })).data.data as ImpactConversationTurn[],
    send: async ({ requestId, requestText, parentResultId }) => {
      await apiClient.post(url + "/turns", { requestId, characterId, baseVersion: version, requestText, priorProposalId: parentResultId }, inline);
      onDiscuss();
    },
    interrupt: turnId => apiClient.post(url + "/interrupt", { characterId, turnId }, inline),
  };
  const decide = useMutation({
    mutationKey: ["outline-character-impact-decision", projectId],
    mutationFn: async ({ id, selection }: { id: string; selection?: string[] }) => {
      if (selection) await applyOutlineProposal(projectId, id, selection);
      else await apiClient.post(`/outlines/${projectId}/proposals/${id}/reject`, {}, inline);
    },
    onSuccess: async (_, { selection }) => { if (selection) await onApplied(); },
    onSettled: () => queries.invalidateQueries({ queryKey }),
  });
  const editable = (r: ImpactResultRef) => r.baseVersion === version && r.status === "pending";
  return <div aria-label="人物联动审阅" className="outline-conversation-host">
    <AgentConversation adapter={adapter} confirmationHint="由你确认后写入大纲" title="人物搭档" context={`${findOutlineNodeTitle(document, characterId)}的故事线 · 修订 v${version}`}
      welcome={{ title: `想让${findOutlineNodeTitle(document, characterId)}怎么变？`, body: "从动机、关系或一次选择说起。我会对照涉及的卷章与伏笔，帮你看清哪些地方需要一起改。",
        starters: [{ label: "先梳理人物牵动的情节", text: "先帮我梳理这个人物牵动了哪些卷章和伏笔，解释它们的联系。" },
          { label: "一起推敲人物的动机", text: "请读一下这个人物的动机和关键选择，和我讨论哪里可以更有说服力。" }] }}
      inputLabel="希望人物怎么变？哪些情节要保留？" placeholder="例如：让她提前怀疑师父，但保留救师父的情节。"
      initialAction="分析相关卷章与伏笔" disabled={dirty || decide.isPending} maxLength={6000} value={requestText} onChange={onRequestChange}
      versionLabel={value => `大纲 v${value}`}
      followUpAction={(result, n) => editable(result) ? `继续讨论第 ${n} 轮提案` : `按当前大纲重审第 ${n} 轮`}
      canContinue={r => ["pending", "applied", "partially_applied"].includes(r.status)} describeResult={r => r.status === "pending" && r.baseVersion !== version ? "大纲有新修订" : labels[r.status] ?? "已结束"}
      renderResult={(result, busy) => <ImpactProposal projectId={projectId} characterId={characterId} result={result} document={document}
        busy={busy || decide.isPending} dirty={dirty} editable={editable(result)}
        onDecision={(id, selection) => decide.mutate({ id, selection })} />} />
    {decide.isError && <p role="alert" className="text-sm text-destructive">{decide.error.message}</p>}
  </div>;
}
