import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { ImpactSummary } from "@ai-novel/shared/types/outlineCharacterImpact";
import { apiClient } from "@/api/client";
import { applyOutlineProposal, type OutlineEditProposalPayload, type OutlineProposal } from "@/api/outlines";
import { Button } from "@/components/ui/button";
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
};

export function CharacterImpactPanel({projectId, version, characterId, document, dirty, requestText, onRequestChange, onApplied}: Props) {
  const [selectedId, setSelected] = useState("");
  const queries = useQueryClient();
  const key = ["outline-character-impact", projectId, version, characterId];
  const url = `/outlines/${projectId}/character-impact`;
  const selection = {baseVersion: version, characterId};
  const list = useQuery({
    queryKey: key, queryFn: async () => (await apiClient.get(url + "/proposals", {params: selection})).data.data as OutlineProposal[],
  });
  const proposals = list.data ?? [];
  const proposal = proposals.find(row => row.id === selectedId) ?? proposals[0];
  const payload = proposal ? JSON.parse(proposal.proposalJson) as OutlineEditProposalPayload & {impact: ImpactSummary} : undefined;
  const generate = useMutation({
    mutationFn: async (priorProposalId?: string) => (await apiClient.post(url + "/generate", {...selection, requestText, priorProposalId}, {errorPresentation: "inline"})).data.data as OutlineProposal,
    onSuccess: async row => {
      setSelected(row.id);
      queries.setQueryData<OutlineProposal[]>(key, old => [row, ...(old ?? []).filter(item => item.id !== row.id)]);
      await queries.invalidateQueries({queryKey: key});
    },
  });
  const decide = useMutation({
    mutationKey: ["outline-character-impact-decision", projectId],
    mutationFn: async ({id, operations}: {id: string; operations?: string[]}) => {
      if (operations) await applyOutlineProposal(projectId, id, operations);
      else await apiClient.post(`/outlines/${projectId}/proposals/${id}/reject`);
    },
    onSuccess: async (_result, {operations}) => {
      if (operations) await onApplied();
      await queries.invalidateQueries({queryKey: key});
    },
  });
  const busy = generate.isPending || decide.isPending;
  return <section aria-label="人物联动审阅" className="space-y-3 border-b border-border/50 pb-4">
    <h3 className="font-semibold">调整{findOutlineNodeTitle(document, characterId)}的故事线</h3>
    <label className="block space-y-1 text-sm">
      <span>希望人物怎么变？哪些情节要保留？</span>
      <textarea className="outline-field outline-textarea" rows={3} value={requestText}
        placeholder="例如：让她提前怀疑师父，但保留救师父的情节，第三卷才揭晓真相。"
        maxLength={6000} onChange={e => onRequestChange(e.target.value)}/>
    </label>
    <Button disabled={dirty || busy || !requestText.trim()} onClick={() => {decide.reset(); generate.mutate(undefined);}}>
      {generate.isPending ? "正在核对人物、卷章和伏笔…" : "分析相关卷章与伏笔"}
    </Button>
    <Button variant="ghost" size="sm" disabled={busy || list.isFetching} onClick={() => void list.refetch()}>刷新待审建议</Button>
    {(generate.error || decide.error || list.error) && <p role="alert" className="text-sm text-destructive">{(generate.error || decide.error || list.error)?.message}</p>}
    {proposals.length > 1 && <label className="block text-sm">选择待审提案
      <select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={proposal?.id} disabled={busy}
        onChange={e => {setSelected(e.target.value); decide.reset();}}>
        {proposals.map(row => <option key={row.id} value={row.id}>{row.requestText}</option>)}
      </select>
    </label>}
    {proposal && payload && <>
      <p className="text-sm">{payload.impact.origin === "external" ? "接入工具提交" : "工作台审阅"} · {proposal.requestText}</p>
      <Button size="sm" variant="outline" disabled={dirty || busy || !requestText.trim()}
        onClick={() => generate.mutate(proposal.id)}>用上方要求调整这份提案</Button>
      {payload.impact.writtenChapterIds.length > 0 && <details className="text-sm"><summary>已有正文的章节（仅供核对）</summary>
        <p>{payload.impact.writtenChapterIds.map(id => findOutlineNodeTitle(document, id)).join("、")}</p></details>}
      {payload.impact.retained.length > 0 && <div className="space-y-1 text-sm"><h4 className="font-medium">建议保留</h4>
        <ul className="list-disc space-y-1 pl-5">{payload.impact.retained.map((item, i) =>
          <li key={i}>{findOutlineNodeTitle(document, item.nodeId)} · {item.reason}</li>)}</ul></div>}
      {payload.operations.length ? <OutlineProposalPanel key={proposal.id} proposal={proposal} document={document}
        isApplying={busy} applyDisabled={dirty} onApply={operations => decide.mutate({id: proposal.id, operations})}
        onDiscard={() => decide.mutate({id: proposal.id})}/> : <>
        <p className="text-sm">这次审阅建议保留现有大纲。</p><Button size="sm" variant="outline" disabled={busy} onClick={() => decide.mutate({id: proposal.id})}>结束审阅</Button>
      </>}
    </>}
  </section>;
}
