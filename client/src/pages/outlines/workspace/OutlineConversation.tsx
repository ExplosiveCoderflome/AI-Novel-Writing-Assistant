import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineConversationResult, OutlineConversationTurn } from "@ai-novel/shared/types/agentConversation/outline";
import { apiClient } from "@/api/client";
import { applyOutlineProposal, type OutlineProposal } from "@/api/outlines";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { OutlineProposalPanel } from "../OutlineProposalPanel";

const inline = { errorPresentation: "inline" } as const;
const labels: Record<string, string> = { pending: "待确认", superseded: "已有后续提案", applied: "已采纳", partially_applied: "部分采纳", rejected: "已放弃", stale: "大纲有新修订" };
const welcomeIdea = { title: "故事从哪个念头开始？", body: "一个人、一场意外，甚至一个画面都可以。我们可以先聊出方向，再一起列出第一版大纲。",
  starters: [{ label: "我只有一个画面", text: "我有一个画面，想从它开始构思故事。你可以先问我一个问题吗？" },
    { label: "陪我找一个故事方向", text: "我还没想好写什么。请给我两个不同的故事方向，让我选一个继续聊。" }] };
const welcomeEdit = { title: "想先聊大纲的哪一处？", body: "可以一起推敲某一章，也可以通看整份故事。说说你想改什么，以及哪些情节希望保留。",
  starters: [{ label: "看看开篇能否抓住读者", text: "请读一遍开篇，告诉我哪里最吸引人，哪里还可以改。先聊思路。" },
    { label: "梳理伏笔的铺设与回收", text: "帮我梳理大纲里还没有回收的伏笔，提出可以落到具体卷章的调整。" }] };

interface Props {
  projectId: string; version: number; document: OutlineDocument; starting: boolean; dirty: boolean;
  value: string; onChange: (value: string) => void; onDiscuss: () => void; onApplied: () => Promise<void>;
}
function Review({ projectId, result, document, version, busy, dirty, decide }: Pick<Props, "projectId" | "document" | "version" | "dirty"> & {
  result: OutlineConversationResult; busy: boolean; decide: (id: string, selection?: string[]) => void;
}) {
  const query = useQuery({ queryKey: ["outline-discussion-proposal", projectId, result.id, result.status],
    queryFn: async () => (await apiClient.get(`/outlines/${projectId}/proposals/${result.id}`, inline)).data.data as OutlineProposal | null });
  if (query.isLoading) return <p role="status">正在读取提案…</p>;
  const proposal = query.data;
  if (!proposal || proposal.projectId !== projectId || proposal.kind !== result.kind) {
    return <p role="alert">未能读取提案。<button className="underline" onClick={() => void query.refetch()}>重试</button></p>;
  }
  return <OutlineProposalPanel proposal={proposal} document={document} isApplying={busy} applyDisabled={dirty}
    readOnly={result.baseVersion !== version || result.status !== "pending" || proposal.status !== "pending"}
    appliedIds={JSON.parse(proposal.proposalJson).appliedOperationIds}
    onApply={ids => decide(proposal.id, ids)} onDiscard={() => decide(proposal.id)} />;
}

export function OutlineConversation({ projectId, version, document, starting, dirty, value, onChange, onDiscuss, onApplied }: Props) {
  const queries = useQueryClient();
  const queryKey = ["agent-conversation", "outline-workbench", projectId];
  const url = `/outlines/${projectId}/conversation`;
  const adapter: AgentConversationAdapter<OutlineConversationResult> = {
    streamUrl: turnId => apiClient.getUri({url: url + "/turns/" + encodeURIComponent(turnId) + "/stream"}),
    queryKey, load: async () => (await apiClient.get(url, inline)).data.data as OutlineConversationTurn[],
    send: async input => { await apiClient.post(url + "/turns", { ...input, baseVersion: version }, inline); onDiscuss(); },
    interrupt: turnId => apiClient.post(url + "/interrupt", { turnId }, inline),
  };
  const decision = useMutation({ mutationKey: ["outline-discussion-decision", projectId],
    mutationFn: async ({ id, selection }: { id: string; selection?: string[] }) => {
      if (selection) await applyOutlineProposal(projectId, id, selection);
      else await apiClient.post(`/outlines/${projectId}/proposals/${id}/reject`, {}, inline);
    },
    onSuccess: async (_, { selection }) => { if (selection) await onApplied(); },
    onSettled: () => queries.invalidateQueries({ queryKey }),
  });
  const idea = starting || !(document.story.premise || document.story.synopsis || document.chapters.length || document.volumes.length || document.characters.length || document.payoffs.length || document.facts.length);
  return <div className="outline-conversation-host">
    <AgentConversation adapter={adapter} confirmationHint="由你确认后写入大纲" title="大纲搭档" context={`整份大纲 · 修订 v${version}`} welcome={idea ? welcomeIdea : welcomeEdit}
      inputLabel="给大纲搭档发消息" placeholder={idea ? "写下脑海里的人、画面或一句台词…" : "想讨论哪里？把想保留的情节也告诉我…"}
      initialAction="发送给大纲搭档" followUpAction={(_, n) => `继续讨论第 ${n} 轮提案`} versionLabel={v => `大纲 v${v}`}
      maxLength={6000} disabled={dirty || decision.isPending} value={value} onChange={onChange}
      canContinue={result => ["pending", "applied", "partially_applied"].includes(result.status)}
      describeResult={result => result.status === "pending" && result.baseVersion !== version ? "大纲有新修订" : labels[result.status] ?? "已结束"}
      renderResult={(result, busy) => <Review projectId={projectId} result={result} version={version} document={document}
        busy={busy || decision.isPending} dirty={dirty} decide={(id, selection) => decision.mutate({ id, selection })} />} />
    {decision.isError && <p role="alert" className="text-sm text-destructive">{decision.error.message}</p>}
  </div>;
}
