import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineConversationResult, OutlineConversationTurn } from "@ai-novel/shared/types/agentConversation/outline";
import { apiClient } from "@/api/client";
import { AgentConversation, type AgentConversationAdapter } from "@/components/agentConversation/AgentConversation";

const inline = { errorPresentation: "inline" } as const;
const labels: Record<string, string> = { pending: "待确认", superseded: "已有后续提案", applied: "已采纳", partially_applied: "部分采纳", rejected: "已放弃", stale: "大纲有新修订" };
function proposalStatus(result: OutlineConversationResult, version: number) {
  if (result.status === "pending" && result.baseVersion !== version) return "大纲有新修订";
  const label = labels[result.status] ?? "已结束";
  return result.adoptedVersion && ["applied", "partially_applied"].includes(result.status)
    ? `${label}为 v${result.adoptedVersion}` : label;
}
const welcomeIdea = { title: "故事从哪个念头开始？", body: "一个人、一场意外，甚至一个画面都可以。我们可以先聊出方向，再一起列出第一版大纲。",
  starters: [{ label: "我只有一个画面", text: "我有一个画面，想从它开始构思故事。你可以先问我一个问题吗？" },
    { label: "陪我找一个故事方向", text: "我还没想好写什么。请给我两个不同的故事方向，让我选一个继续聊。" }] };
const welcomeEdit = { title: "想怎样调整整本书？", body: "可以一起梳理主线、人物关系和卷章安排。哪些情节希望保留，也可以告诉我。",
  starters: [{ label: "看看开篇能否抓住读者", text: "请读一遍开篇，告诉我哪里最吸引人，哪里还可以改。先聊思路。" },
    { label: "梳理伏笔的铺设与回收", text: "帮我梳理大纲里还没有回收的伏笔，提出可以落到具体卷章的调整。" }] };

interface Props {
  projectId: string; version: number; document: OutlineDocument; starting: boolean; dirty: boolean;
  value: string; onChange: (value: string) => void; onSent: (turnId: string) => void; onOpenResult: (id: string) => void;
}
export function OutlineConversation({ projectId, version, document, starting, dirty, value, onChange, onSent, onOpenResult }: Props) {
  const queryKey = ["agent-conversation", "outline-workbench", projectId];
  const url = `/outlines/${projectId}/conversation`;
  const adapter: AgentConversationAdapter<OutlineConversationResult> = {
    streamUrl: turnId => apiClient.getUri({url: url + "/turns/" + encodeURIComponent(turnId) + "/stream"}),
    queryKey, load: async () => (await apiClient.get(url, inline)).data.data as OutlineConversationTurn[],
    send: async input => { const response = await apiClient.post(url + "/turns", { ...input, baseVersion: version }, inline); onSent(response.data.data.turnId); },
    interrupt: turnId => apiClient.post(url + "/interrupt", { turnId }, inline),
  };
  const idea = starting || !(document.story.premise || document.story.synopsis || document.chapters.length || document.volumes.length || document.characters.length || document.payoffs.length || document.facts.length);
  return <div className="outline-conversation-host">
    <AgentConversation adapter={adapter} confirmationHint="由你确认后写入大纲" title="大纲助手" context={`整份大纲 · 修订 v${version}`} welcome={idea ? welcomeIdea : welcomeEdit}
      inputLabel="给大纲助手发消息" placeholder={idea ? "写下脑海里的人、画面或一句台词…" : "想怎样调整整份大纲？哪些情节希望保留？"}
      followUpPlaceholder="这份提案里，哪些安排想保留或调整？"
      initialAction="发送给大纲助手" followUpAction={(result, n) => result.draftSummary ? `继续讨论《${result.draftSummary.title}》` : `继续讨论第 ${n} 轮提案`} versionLabel={v => `大纲 v${v}`}
      maxLength={6000} disabled={dirty} value={value} onChange={onChange}
      canContinue={result => ["pending", "applied", "partially_applied"].includes(result.status)}
      describeResult={result => proposalStatus(result, version)}
      draftPreview={({ draftSummary: d }) => d && ({
        title: d.title, counts: `${d.volumeCount} 卷 · ${d.chapterCount} 章 · ${d.characterCount} 位人物`,
      })}
      followUpTopic={(result, number) => result.draftSummary ? `正在讨论《${result.draftSummary.title}》`
        : result.kind === "edit" ? `正在讨论《${document.story.title}》的修改建议` : `正在讨论第 ${number} 轮初稿`}
      onOpenResult={onOpenResult} />
  </div>;
}
