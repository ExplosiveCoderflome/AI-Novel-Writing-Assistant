import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { candidateFieldLabel, type CandidateProposal, type CandidateStoryField } from "@ai-novel/shared/types/director/candidateReview";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import { apiClient, type ApiHttpError } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { Button } from "@/components/ui/button";

const inline = { errorPresentation: "inline" } as const;
const labels = { pending: "待你选择", applied: "已采纳", superseded: "有后续建议", stale: "方向有更新" };
interface Props {
  taskId: string; batchId: string; candidate: DirectorCandidate; disabled: boolean;
  context: ReactNode;
  draft: string;
  onDraftChange: (value: string) => void;
  onApplied: (batchId: string, candidate: DirectorCandidate) => void;
}

function ProposalReview({ proposal, disabled, apply }: {
  proposal: CandidateProposal; disabled: boolean; apply: (fields: CandidateStoryField[]) => void;
}) {
  const [fields, setFields] = useState(proposal.changes.map(item => item.field));
  const pending = proposal.status === "pending";
  return <div className="space-y-3">
    {proposal.changes.map(item => <div key={item.field} className="space-y-1.5 border-b border-border/45 pb-3">
      <label className="flex items-center gap-2 font-medium">
        {pending && <input type="checkbox" checked={fields.includes(item.field)} disabled={disabled}
          onChange={e => setFields(previous => e.target.checked ? [...previous, item.field] : previous.filter(field => field !== item.field))} />}
        {candidateFieldLabel[item.field]}
        {proposal.appliedFields.includes(item.field) && <small className="text-muted-foreground">已采纳</small>}
      </label>
      <p className="text-muted-foreground">原文　{item.before}</p>
      <p>建议　{item.value}</p>
      <p className="text-sm text-muted-foreground">{item.reason}</p>
    </div>)}
    {pending && <Button type="button" size="sm" onClick={() => apply(fields)} disabled={disabled || !fields.length}>
      采纳所选修改（{fields.length}）
    </Button>}
  </div>;
}

export function CandidateDiscussion({ taskId, batchId, candidate, disabled, onApplied, context, draft, onDraftChange }: Props) {
  const client = useQueryClient();
  const key = ["agent-conversation", "opening-candidate", taskId, batchId, candidate.id];
  const url = `/novels/director/tasks/${encodeURIComponent(taskId)}/batches/${encodeURIComponent(batchId)}/candidates/${encodeURIComponent(candidate.id)}/conversation`;
  async function refreshCandidate() {
    await client.invalidateQueries({ queryKey: queryKeys.tasks.detail("novel_workflow", taskId) });
  }
  const apply = useMutation({
    mutationKey: ["apply-opening-candidate", taskId],
    mutationFn: async ({ id, fields }: { id: string; fields: CandidateStoryField[] }) =>
      (await apiClient.post(url + "/proposals/" + encodeURIComponent(id) + "/apply", { fields }, inline)).data.data as DirectorCandidate,
    onSuccess: result => onApplied(batchId, result),
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: key }), refreshCandidate()]),
  });
  const adapter: AgentConversationAdapter<CandidateProposal> = {
    queryKey: key,
    load: async () => (await apiClient.get(url, inline)).data.data as AgentConversationTurn<CandidateProposal>[],
    send: async input => {
      try { await apiClient.post(url + "/turns", { ...input, revision: candidate.reviewRevision ?? 0 }, inline); }
      catch (error) { if ((error as ApiHttpError).status === 409) await refreshCandidate(); throw error; }
    },
    interrupt: id => apiClient.post(url + "/turns/" + encodeURIComponent(id) + "/interrupt", {}, inline),
    streamUrl: id => apiClient.getUri({ url: url + "/turns/" + encodeURIComponent(id) + "/stream" }),
  };
  return <>
      <AgentConversation adapter={adapter} title="开书助手" context={context}
        confirmationHint="采纳会更新这套候选，选用后开书" inputLabel="这套开书方向想讨论什么"
        welcome={{ title: candidate.hookStrategy?.trim() ? candidateFieldLabel.hookStrategy : "故事梗概",
          body: candidate.hookStrategy?.trim() || candidate.logline,
          starters: [{ label: "第一章可以从哪一幕开始？", text: "结合这套方向，聊聊第一章可以从哪一幕切入，以及为什么。" },
            { label: "主角还有别的选择吗？", text: "保留故事背景，让主角在开局做一个不同的选择，会怎样改变后面的冲突？" }] }}
        placeholder="喜欢哪些地方？哪里想换一种写法？" followUpPlaceholder="想保留或调整上一份建议里的哪些内容？"
        initialAction="发送给开书助手" followUpAction={(_, n) => `追问第 ${n} 轮建议`} followUpTopic={(_, n) => `讨论第 ${n} 轮建议`}
        versionLabel={v => `方向稿 ${Number(v) + 1}`} disabled={disabled || apply.isPending} maxLength={4000}
        value={draft} onChange={onDraftChange} canContinue={result => result.status !== "superseded"}
        describeResult={result => result.status === "applied" ? `采纳了 ${result.appliedFields.length} 项` : labels[result.status]}
        renderResult={(result, busy) => <ProposalReview key={result.id} proposal={result} disabled={disabled || busy || apply.isPending}
          apply={fields => apply.mutate({ id: result.id, fields })} />} />
      {apply.error && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{apply.error.message}</p>}
  </>;
}
