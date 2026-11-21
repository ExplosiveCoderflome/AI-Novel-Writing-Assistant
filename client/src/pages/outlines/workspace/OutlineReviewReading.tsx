import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Feather } from "lucide-react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";
import { apiClient } from "@/api/client";
import type { OutlineConversationTurn } from "@ai-novel/shared/types/agentConversation/outline";
import { applyOutlineProposal, listOutlineRevisions, type OutlineProposal, type OutlineProject, type OutlineEditProposalPayload } from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { OutlineProposalPanel } from "../OutlineProposalPanel";
import { outlineReviewThread, type LocalTarget } from "./outlineReviewThread";
import { findOutlineNode, getOutlineNodeTitle, findOutlineNodeTitle } from "../outlineNodes";

interface Props {
  projectId: string; proposalId: string; version: number; document: OutlineDocument; locked: boolean; busy: boolean;
  onReturn: (nodeId?: string) => void; onSelect: (id: string) => void;
  onApplied: (version: number, nodeId?: string) => void;
  onRequest: (text: string, priorId: string, target?: LocalTarget) => void;
}
const statuses: Record<string,string> = { applied: "已采纳", partially_applied: "部分采纳", superseded: "已有后续建议", rejected: "已放弃", stale: "大纲有新版本" };

export function OutlineReviewReading({ projectId, proposalId, version, document, locked, busy, onReturn, onSelect, onApplied, onRequest }: Props) {
  const cache = useQueryClient();
  const [guidance, setGuidance] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const review = useQuery({ queryKey: ["outline-review", projectId, proposalId], queryFn: async () =>
    (await apiClient.get(`/outlines/${projectId}/proposals/${proposalId}`, { errorPresentation: "inline" })).data.data as OutlineProposal | null });
  const proposal = review.data;
  const payload = proposal ? JSON.parse(proposal.proposalJson) as OutlineEditProposalPayload & { impact?: ImpactSummary; chapterId?: string; volumeId?: string; appliedOperationIds?: string[] } : null;
  const impact = payload?.impact;
  const target: LocalTarget | undefined = impact ? {kind:"character", id:impact.characterId}
    : proposal?.kind === "volume_edit" && payload?.volumeId ? {kind:"volume", id:payload.volumeId}
    : proposal?.kind === "chapter_edit" && payload?.chapterId ? {kind:"chapter", id:payload.chapterId} : undefined;
  const operationNodes = [...new Set(payload?.operations?.map(op => op.nodeId))];
  const ownerId = target?.id ?? payload?.volumeId ?? (operationNodes.length === 1 ? operationNodes[0] : undefined);
  const owner = ownerId ? findOutlineNode(document, ownerId) : undefined;
  const localHistoryKey = outlineReviewThread(projectId, target).queryKey;
  const wholeHistory = useQuery<OutlineConversationTurn[]>({
    queryKey: ["agent-conversation", "outline-workbench", projectId],
    queryFn: async () => (await apiClient.get(`/outlines/${projectId}/conversation`, { errorPresentation: "inline" })).data.data,
    enabled: !!proposal && !target && !payload?.volumeId,
  });
  const revisions = useQuery({ queryKey: ["outline-revisions", projectId], queryFn: () => listOutlineRevisions(projectId) });
  const roundIndex = wholeHistory.data?.findIndex(turn => turn.result?.id === proposalId) ?? -1;
  const adopted = revisions.data?.find(rev => rev.sourceProposalId === proposalId)?.version;
  const person = owner && "appearanceNodeIds" in owner ? owner : undefined;
  const decision = useMutation({
    mutationKey: ["outline-discussion-decision", projectId],
    mutationFn: (ids: string[]) => applyOutlineProposal(projectId, proposalId, ids),
    onSuccess: result => {
      cache.setQueryData<OutlineProject>(["outline", projectId], old => old && ({ ...old, currentVersion: result.revision.version, title: result.document.story.title, document: result.document }));
      onApplied(result.revision.version, ownerId && findOutlineNode(result.document, ownerId) ? ownerId : result.document.story.nodeId);
    },
    onSettled: async () => {
      await Promise.all(["outline", "outline-review", "outline-pending", "outline-revisions", "outlines"].map(key =>
        cache.invalidateQueries({ queryKey: key === "outlines" ? [key] : [key, projectId] })));
      await cache.invalidateQueries({queryKey:localHistoryKey});
    },
  });
  const reject = useMutation({ mutationKey: ["outline-discussion-decision", projectId],
    mutationFn: () => apiClient.post(`/outlines/${projectId}/proposals/${proposalId}/reject`, {}, { errorPresentation: "inline" }),
    onSuccess: () => { onReturn(ownerId); void cache.invalidateQueries({queryKey:["outline-pending",projectId]}); void cache.invalidateQueries({queryKey:["outline-review",projectId]});
      void cache.invalidateQueries({queryKey:localHistoryKey}); },
  });
  const back = <button type="button" className="outline-reading-link" onClick={() => onReturn(ownerId)}><ArrowLeft size={14} />回到当前稿</button>;
  if (review.isLoading) return <p role="status" className="outline-reading">正在读取建议…</p>;
  if (!proposal || proposal.projectId !== projectId || !["initial_generation","character_impact","chapter_edit","volume_edit","volume_beats","edit"].includes(proposal.kind)) return <div className="outline-reading">{back}<p role="alert">无法打开这份大纲建议。</p><Button onClick={() => void review.refetch()}>重新读取</Button></div>;
  const pending = proposal.status === "pending", stale = pending && proposal.baseVersion !== version;
  const initial = proposal.kind === "initial_generation";
  const canRequest = proposal.kind !== "volume_beats" && pending && (!target || !!owner);
  const submitting = locked || decision.isPending || reject.isPending || busy;
  const topic = owner ? getOutlineNodeTitle(owner) : (initial ? "初稿" : "大纲");
  return <article className="outline-reading outline-review-reading">
    <header className="outline-reading-meta">{back}<span>{pending ? stale ? "旧建议" : "待采纳" : statuses[proposal.status] ?? "已结束"}{adopted && `为 v${adopted}`}</span></header>
    {(!initial || stale) && <h2>{stale ? "重看" + topic + "的旧建议" : topic + "的修改建议"}</h2>}
    {stale && <p className="outline-version-note">这份建议写于 v{proposal.baseVersion}。当前大纲是 v{version}，{proposal.kind === "volume_beats" ? "可回到本卷重新规划节奏。" : "可选出想保留的方向，让 AI 根据当前稿重新拟一份。"}</p>}
    {stale && initial && <details className="outline-volume"><summary>查看当前稿 v{version}《{document.story.title}》</summary>
      <p>{document.story.premise}</p><p>{document.story.synopsis}</p><p>{document.volumes.map(vol => vol.title).join("、")}</p><p>{document.characters.map(p => p.name).join("、")}</p>
    </details>}
    {proposal.requestText && !initial && <p className="outline-request-quote">{proposal.requestText}</p>}
    <OutlineProposalPanel proposal={proposal} document={document} currentVersion={version} round={roundIndex >= 0 ? roundIndex + 1 : undefined} personName={person?.name} readOnly={!pending || stale}
      appliedIds={impact?.appliedOperationIds ?? payload?.appliedOperationIds} isApplying={decision.isPending} applyDisabled={submitting}
      onApply={ids => { if (!submitting && pending && !stale) decision.mutate(ids); }} onLater={() => onReturn(ownerId)}
      renderContext={base => impact && <div className="outline-impact-context">
        {person && !!person.appearanceNodeIds.length && <section><h3>当前稿的出场卷章</h3>{person.appearanceNodeIds.map(ref =>
          <button type="button" className="outline-reading-link" key={ref} onClick={() => onSelect(ref)}>{findOutlineNodeTitle(document, ref)} ↗</button>)}</section>}
        {!!impact.retained.length && <details><summary>建议保留的情节与设定 · {impact.retained.length}</summary><ul>{impact.retained.map((item,i) =>
          <li key={i}><b>{findOutlineNodeTitle(base,item.nodeId)}</b>　{item.reason}</li>)}</ul></details>}
        {!!impact.writtenChapterIds.length && <details><summary>已有正文的章节</summary><p>{impact.writtenChapterIds.map(id => findOutlineNodeTitle(base,id)).join("、")}</p></details>}
      </div>} />
    {pending && target && !owner && <p role="status">当前稿中找不到这条内容。可从目录选择要修改的分卷、人物或章节。</p>}
    {canRequest && (stale || followUp ? <form className="outline-review-followup" onSubmit={e => {
      e.preventDefault(); if (!submitting && (stale || guidance.trim())) onRequest(guidance.trim() || "请对照这份旧建议与当前大纲，重新给出适合当前稿的修改建议。", proposalId, target);
    }}>
      <label> {stale ? "旧建议里，你想保留什么？" : "你还想调整什么？"}
        <textarea value={guidance} onChange={e => setGuidance(e.target.value)} maxLength={6000} rows={2}
          placeholder={stale ? "可选，写下想保留的动机、情节或一句话…" : "写下希望调整的方向…"} /></label>
      <div className="outline-reading-actions"><Button disabled={submitting || (!stale && !guidance.trim())}>{stale ? "按当前大纲重新给建议" : "生成调整后的建议"}</Button>
        {stale && <Button type="button" variant="ghost" onClick={() => onReturn(ownerId)}>保留当前稿</Button>}</div>
    </form> : <button type="button" className="outline-reading-link" onClick={() => setFollowUp(true)}><Feather size={14} />{initial ? "我想换个方向" : "再提个要求"}</button>)}
    {pending && !stale && <details className="outline-review-options"><summary>其他操作</summary><button disabled={submitting} onClick={() => {
      if (window.confirm("放弃这份建议？仍可在讨论记录里查看。")) reject.mutate();
    }}>放弃这份建议</button></details>}
    {(decision.error || reject.error) && <p role="alert">{(decision.error || reject.error)?.message}</p>}
  </article>;
}
