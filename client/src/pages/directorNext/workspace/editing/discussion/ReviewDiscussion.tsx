import { useState } from "react";
import { apiClient } from "@/api/client";
import { directorCharacterProfilePath } from "@/api/directorCharacterProfile";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";
import { Button } from "@/components/ui/button";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { castFieldLabels } from "@ai-novel/shared/types/director/castReview/discussion";
import { volumeFieldLabels } from "@ai-novel/shared/types/director/volumeReview/discussion";
import type { ReviewChange, ReviewProposal } from "@ai-novel/shared/types/director/review/fieldSuggestions";

const labels = { ...castFieldLabels, ...volumeFieldLabels };
type Proposal = ReviewProposal<string>;
type Scope = {type:"final_review";sourceHash:string;finding:number|"all"} | { type: "character_cast" | "character_profile" } | {type:"chapter_batch_closed"; bodyHash:string} | { type: "volume_strategy" | "chapter_task_sheet"; planVersionId: string };

const inline = { errorPresentation: "inline" } as const;
interface Props {
  novelId: string; runId?: string; version?: number; scope: Scope; subject: { id: string; title: string };
  base: Record<string, string>; draft: Record<string, string>; disabled: boolean;
  message: string; onMessage: (value: string) => void;
  fieldLabels?: Record<string,string>;
  lockedField?: string;
  onAccept: (changes: ReviewChange<string>[]) => void;
}

function Suggestions({ proposal, draft, disabled, onAccept, fieldLabels, lockedField }: {
  fieldLabels: Record<string,string>; proposal: Proposal; draft: Record<string, string>; disabled: boolean; onAccept: Props["onAccept"];
  lockedField?: string;
}) {
  const [picked, setPicked] = useState(() => new Set(proposal.changes.map(item => item.field)));
  const selectable = proposal.changes.filter(item => item.field !== lockedField && draft[item.field] === item.before);
  const selected = selectable.filter(item => picked.has(item.field));
  return <div className="space-y-3">
    {proposal.changes.map(item => {
      const accepted = draft[item.field] === item.value;
      const locked = item.field === lockedField;
      const available = !locked && draft[item.field] === item.before;
      return <div key={item.field} className="space-y-1.5 border-b border-border/40 pb-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" disabled={disabled || !available} checked={accepted || (available && picked.has(item.field))}
            onChange={event => { const checked = event.target.checked; setPicked(previous => {
              const next = new Set(previous);
              if (checked) next.add(item.field); else next.delete(item.field);
              return next;
            }); }}/>
          {fieldLabels[item.field]}
        </label>
        <p className="whitespace-pre-wrap text-muted-foreground">原文　{item.before || "尚未填写"}</p>
        <p className="whitespace-pre-wrap">建议　{item.value}</p>
        <p className="text-sm text-muted-foreground">{item.reason}</p>
        {locked ? <p className="text-xs">这项资料当前不可修改。</p>
          : !available && <p className="text-xs">{accepted ? "已加入编辑稿" : "这项编辑稿有变化，可以按新稿继续讨论。"}</p>}
      </div>;
    })}
    {selectable.length > 0 && <Button type="button" size="sm" disabled={disabled || !selected.length} onClick={() => onAccept(selected)}>
      采纳所选修改（{selected.length}）
    </Button>}
  </div>;
}

function presentation(scope: Scope, version: number | undefined, title: string) {
  if (scope.type === "character_profile") return {
    path: "characters", key: "director-character-profile", assistant: "角色助手",
    welcome: {title: `想怎么调整${title}？`, body: "说说希望怎样改，选中的建议会填进编辑稿。",
      starters: [{label: "让人物更有辨识度", text: "保留这个人的关键经历，给出能让人物更有辨识度的改法。"}]},
    hint: "核对编辑稿后，点「保存角色资料」。", placeholder: "写下你想修改的角色资料…",
  };
  if(scope.type==="final_review") return {path:"final-review",key:"director-final-review",assistant:"完稿助手",
    welcome:{title:scope.finding==="all"?"想再核对哪一段？":"这个问题会怎样影响阅读？",body:"可以先问原因，也可以请助手给出改法。",starters:[{label:"请给出逐段改法",text:scope.finding==="all"?"通读本章，对需要打磨的段落给出具体修改建议。":"针对选中的检查问题，给出可以逐段采纳的修改建议。"}]},hint:"采纳的段落会进入确认稿。",placeholder:"写下想保留的句子，或你对改法的想法…"};
  if (scope.type === "chapter_batch_closed") return {
    path:`prose-review/${version}/versions/${encodeURIComponent(scope.bodyHash)}/chapters`,key:"director-prose",assistant:"正文助手",
    welcome:{title:"这一章读起来怎么样？",body:"可以先问读后感，也可以指出想改的地方。",starters:[
      {label:"哪里读起来拖沓？",text:"读一遍本章，告诉我哪里节奏慢，为什么。"},
      {label:"让结尾更有余味",text:"保留本章发生的事，帮我改一改结尾，给读者留一点余味。"},
    ]},hint:"逐段比较原文和建议，采纳后可以撤回。",placeholder:"想讨论哪段正文，或希望读者读到什么感受？",
  };
  if (scope.type === "chapter_task_sheet") return {
    path: `chapter-review/${version}/plans/${encodeURIComponent(scope.planVersionId)}/chapters`, key: "director-chapter", assistant:"章节助手",
    welcome:{ title: "想怎么写这一章？", body:"可以讨论本章要发生什么，也可以只改其中一场。", starters:[
      {label:"这一章要推进什么？", text:"结合本章路线，解释主角要做什么、会遇到什么阻力。"},
      {label:"让第二场的转折更有代价", text:"帮我调整第二场的转折，让主角必须做一个有代价的选择。"},
    ]}, hint:"采纳会填入本章编辑稿，可以继续手改，再一起确认。", placeholder:"写下你想讨论的章节任务或场景…",
  };
  if (scope.type === "volume_strategy") return {
    path:`volume-review/${version}/plans/${encodeURIComponent(scope.planVersionId)}/volumes`, key:"director-volume", assistant:"卷纲助手",
    welcome:{ title:`想怎么调整《${title}》？`, body:"可以先聊读者最期待什么，再决定要改哪一项。", starters:[
      {label:"高潮能兑现期待吗？",text:"这卷的高潮能兑现前面给读者的期待吗？说说你的判断。"},
      {label:"让卷末的选择更有代价",text:"保留本卷的主线，让主角在高潮做一个更有代价的选择。"},
    ]}, hint:"采纳会填入本卷编辑稿，确认卷纲后再拆章。", placeholder:"写下你想讨论的情节或改法…",
  };
  return {path:`cast-review/${version}/characters`, key:"director-cast", assistant:"角色助手",
    welcome:{title:`想怎么写${title}？`, body:"说说你希望保留的地方，或希望这个人做出怎样的选择。", starters:[
      {label:"这个角色想要什么？",text:"结合开书方向，说说这个角色最想做成什么事，为什么。"},
      {label:"让这个角色更主动",text:"保留现有的人物关系，让这个角色主动做一个影响剧情的选择。"},
    ]}, hint:"采纳会填入编辑稿，保存后导演继续。", placeholder:"写下你对这个角色的想法…",
  };
}

export function ReviewDiscussion({ novelId, runId, version, subject, scope, base, draft, fieldLabels = labels, lockedField, disabled, message, onMessage, onAccept }: Props) {
  const config = presentation(scope, version, subject.title);
  const root = `/director-next/novels/${encodeURIComponent(novelId)}`;
  const url = scope.type === "character_profile" ? directorCharacterProfilePath(novelId, subject.id) + "/conversation"
    : scope.type==="final_review" ? `${root}/final-review/chapters/${encodeURIComponent(subject.id)}/${scope.sourceHash}/findings/${scope.finding}/conversation` : `${root}/runs/${encodeURIComponent(runId!)}/${config.path}/${encodeURIComponent(subject.id)}/conversation`;
  const adapter: AgentConversationAdapter<Proposal> = {
    queryKey: ["agent-conversation", config.key, novelId, ...(scope.type==="final_review" ? [scope.sourceHash,String(scope.finding)] : scope.type==="character_profile" ? [] : [runId!, String(version)]), ...("planVersionId" in scope ? [scope.planVersionId] : "bodyHash" in scope ? [scope.bodyHash] : []), subject.id],
    load: async () => (await apiClient.get(url, inline)).data.data as AgentConversationTurn<Proposal>[],
    send: input => apiClient.post(url + "/turns", { ...input, base, draft }, inline),
    interrupt: id => apiClient.post(url + "/turns/" + encodeURIComponent(id) + "/interrupt", {}, inline),
    streamUrl: id => apiClient.getUri({ url: url + "/turns/" + encodeURIComponent(id) + "/stream" }),
  };
  return <div className="min-w-0 [container-type:inline-size] lg:flex lg:min-h-0 lg:[&_.agent-feed]:overflow-y-auto">
    <AgentConversation adapter={adapter} title={config.assistant} context={`正在讨论 · ${subject.title}`}
      welcome={config.welcome} confirmationHint={config.hint} inputLabel={`与助手讨论${subject.title}`}
      placeholder={config.placeholder} followUpPlaceholder="这份建议里，想保留或改动什么？"
      initialAction={`发送给${config.assistant}`} followUpAction={(_, n) => `追问第 ${n} 轮建议`} followUpTopic={(_, n) => `讨论第 ${n} 轮建议`}
      versionLabel={() => subject.title} disabled={disabled} maxLength={4000}
      value={message} onChange={onMessage} canContinue={() => true} describeResult={result => `${result.changes.length} 项建议`}
      renderResult={(proposal, busy) => <Suggestions fieldLabels={fieldLabels} key={proposal.id} proposal={proposal} draft={draft}
        disabled={busy || disabled} lockedField={lockedField} onAccept={onAccept}/>}/>
  </div>;
}
