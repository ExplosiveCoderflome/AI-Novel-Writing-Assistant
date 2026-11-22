import { useState } from "react";
import { apiClient } from "@/api/client";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { Button } from "@/components/ui/button";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { castFieldLabels } from "@ai-novel/shared/types/director/castReview/discussion";
import { volumeFieldLabels } from "@ai-novel/shared/types/director/volumeReview/discussion";
import type { ReviewChange, ReviewProposal } from "@ai-novel/shared/types/director/review/fieldSuggestions";

const labels = { ...castFieldLabels, ...volumeFieldLabels };
type Field = keyof typeof labels;
type Proposal = ReviewProposal<Field>;
type Scope = { type: "character_cast" } | { type: "volume_strategy"; planVersionId: string };

const inline = { errorPresentation: "inline" } as const;
interface Props {
  novelId: string; runId: string; version: number; scope: Scope; subject: { id: string; title: string };
  base: Record<string, string>; draft: Record<string, string>; disabled: boolean;
  message: string; onMessage: (value: string) => void;
  onAccept: (changes: ReviewChange<Field>[]) => void;
}

function Suggestions({ proposal, draft, disabled, onAccept }: {
  proposal: Proposal; draft: Record<string, string>; disabled: boolean; onAccept: Props["onAccept"];
}) {
  const [picked, setPicked] = useState(() => new Set(proposal.changes.map(item => item.field)));
  const selected = proposal.changes.filter(item => picked.has(item.field) && draft[item.field] === item.before);
  return <div className="space-y-3">
    {proposal.changes.map(item => {
      const accepted = draft[item.field] === item.value;
      const available = draft[item.field] === item.before;
      return <div key={item.field} className="space-y-1.5 border-b border-border/40 pb-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" disabled={disabled || !available} checked={accepted || (available && picked.has(item.field))}
            onChange={event => { const checked = event.target.checked; setPicked(previous => {
              const next = new Set(previous);
              if (checked) next.add(item.field); else next.delete(item.field);
              return next;
            }); }}/>
          {labels[item.field]}
        </label>
        <p className="whitespace-pre-wrap text-muted-foreground">原文　{item.before || "尚未填写"}</p>
        <p className="whitespace-pre-wrap">建议　{item.value}</p>
        <p className="text-sm text-muted-foreground">{item.reason}</p>
        {!available && <p className="text-xs">{accepted ? "已加入编辑稿" : "这项编辑稿有变化，可以按新稿继续讨论。"}</p>}
      </div>;
    })}
    {proposal.changes.some(item => draft[item.field] === item.before) && <Button type="button" size="sm" disabled={disabled || !selected.length} onClick={() => onAccept(selected)}>
      采纳所选修改（{selected.length}）
    </Button>}
  </div>;
}

export function ReviewDiscussion({ novelId, runId, version, subject, scope, base, draft, disabled, message, onMessage, onAccept }: Props) {
  const volume = scope.type === "volume_strategy";
  const path = volume ? `volume-review/${version}/plans/${encodeURIComponent(scope.planVersionId)}/volumes` : `cast-review/${version}/characters`;
  const url = `/director-next/novels/${encodeURIComponent(novelId)}/runs/${encodeURIComponent(runId)}/${path}/${encodeURIComponent(subject.id)}/conversation`;
  const adapter: AgentConversationAdapter<Proposal> = {
    queryKey: ["agent-conversation", volume ? "director-volume" : "director-cast", novelId, runId, String(version), ...(volume ? [scope.planVersionId] : []), subject.id],
    load: async () => (await apiClient.get(url, inline)).data.data as AgentConversationTurn<Proposal>[],
    send: input => apiClient.post(url + "/turns", { ...input, base, draft }, inline),
    interrupt: id => apiClient.post(url + "/turns/" + encodeURIComponent(id) + "/interrupt", {}, inline),
    streamUrl: id => apiClient.getUri({ url: url + "/turns/" + encodeURIComponent(id) + "/stream" }),
  };
  return <div className="min-w-0 [container-type:inline-size] lg:flex lg:min-h-0 lg:[&_.agent-feed]:overflow-y-auto">
    <AgentConversation adapter={adapter} title={volume ? "卷纲助手" : "角色助手"} context={`正在讨论 · ${subject.title}`}
      welcome={volume ? { title: `想怎么调整《${subject.title}》？`, body: "可以先聊读者最期待什么，再决定要改哪一项。", starters: [
        { label: "高潮能兑现期待吗？", text: "这卷的高潮能兑现前面给读者的期待吗？说说你的判断。" },
        { label: "让卷末的选择更有代价", text: "保留本卷的主线，让主角在高潮做一个更有代价的选择。" },
      ] } : { title: `想怎么写${subject.title}？`, body: "说说你希望保留的地方，或希望这个人做出怎样的选择。", starters: [
        { label: "这个角色想要什么？", text: "结合开书方向，说说这个角色最想做成什么事，为什么。" },
        { label: "让这个角色更主动", text: "保留现有的人物关系，让这个角色主动做一个影响剧情的选择。" },
      ] }}
      confirmationHint={volume ? "采纳会填入本卷编辑稿，确认卷纲后再拆章。" : "采纳会填入编辑稿，保存后导演继续。"} inputLabel={`与助手讨论${subject.title}`}
      placeholder={volume ? "写下你想讨论的情节或改法…" : "写下你对这个角色的想法…"} followUpPlaceholder="这份建议里，想保留或改动什么？"
      initialAction={volume ? "发送给卷纲助手" : "发送给角色助手"} followUpAction={(_, n) => `追问第 ${n} 轮建议`} followUpTopic={(_, n) => `讨论第 ${n} 轮建议`}
      versionLabel={() => subject.title} disabled={disabled} maxLength={4000}
      value={message} onChange={onMessage} canContinue={() => true} describeResult={result => `${result.changes.length} 项建议`}
      renderResult={(proposal, busy) => <Suggestions key={proposal.id} proposal={proposal} draft={draft}
        disabled={busy || disabled} onAccept={onAccept}/>}/>
  </div>;
}
