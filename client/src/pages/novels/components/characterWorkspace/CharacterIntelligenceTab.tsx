import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import type { CharacterDialogueInfluenceStatus, CharacterDialogueSession } from "@ai-novel/shared/types/characterDialogue";
import { Brain, MessageCircle, RefreshCw, Send, ShieldCheck, Sparkles } from "lucide-react";
import {
  activateLatestCharacterDialogueInfluence,
  createCharacterDialogueSession,
  dismissLatestCharacterDialogueInfluence,
  getActiveCharacterDialogueSession,
  getCharacterMindState,
  refreshCharacterMindState,
  sendCharacterDialogueTurn,
} from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CharacterIntelligenceTabProps {
  novelId: string;
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { novelId, selectedCharacter } = props;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const queryKey = queryKeys.novels.characterMindState(novelId, selectedCharacter.id);
  const dialogueQueryKey = queryKeys.novels.characterDialogueSession(novelId, selectedCharacter.id);
  const mindQuery = useQuery({
    queryKey,
    queryFn: () => getCharacterMindState(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshCharacterMindState(novelId, selectedCharacter.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const mind = mindQuery.data?.data ?? null;
  const dialogueQuery = useQuery({
    queryKey: dialogueQueryKey,
    queryFn: () => getActiveCharacterDialogueSession(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id && mind),
  });
  const invalidateDialogue = () => queryClient.invalidateQueries({ queryKey: dialogueQueryKey });
  const createDialogueMutation = useMutation({
    mutationFn: () => createCharacterDialogueSession(novelId, selectedCharacter.id),
    onSuccess: invalidateDialogue,
  });
  const sendTurnMutation = useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      sendCharacterDialogueTurn(novelId, selectedCharacter.id, sessionId, { message: content }),
    onSuccess: () => {
      setMessage("");
      invalidateDialogue();
    },
  });
  const activateInfluenceMutation = useMutation({
    mutationFn: (sessionId: string) => activateLatestCharacterDialogueInfluence(novelId, selectedCharacter.id, sessionId),
    onSuccess: invalidateDialogue,
  });
  const dismissInfluenceMutation = useMutation({
    mutationFn: (sessionId: string) => dismissLatestCharacterDialogueInfluence(novelId, selectedCharacter.id, sessionId),
    onSuccess: invalidateDialogue,
  });
  const dialogue = dialogueQuery.data?.data ?? null;

  if (mindQuery.isLoading) {
    return <section className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">正在整理角色当前的想法与行动倾向...</section>;
  }

  if (!mind) {
    return (
      <section className="rounded-2xl border border-dashed bg-muted/10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4" />理解当前角色</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              AI 会结合角色档案、关系、已发生剧情和当前处境，整理“{selectedCharacter.name}”现在如何理解局面、想做什么以及可能的误判。
            </p>
          </div>
          <AiButton onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            {refreshMutation.isPending ? "整理中..." : "让 AI 整理当前想法"}
          </AiButton>
        </div>
        {refreshMutation.error ? <div className="mt-3 text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "整理失败，请稍后重试。"}</div> : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4" />角色思路线</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">这是 AI 基于已知剧情作出的角色主观推断，不会自动改写小说正史。</p>
          </div>
          <AiButton variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{refreshMutation.isPending ? "刷新中..." : "刷新当前理解"}
          </AiButton>
        </div>
        <div className="mt-4 text-sm leading-7">{mind.currentInterpretation}</div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <MindPanel title="想做什么" value={mind.activePlan || mind.privateIntent} />
        <MindPanel title="受压时会怎样行动" value={mind.actionTendency} />
        <MindPanel title="当前情绪与立场" value={mind.emotionalStance} />
        <MindPanel title="什么会改变决定" value={mind.decisionTrigger} />
      </div>

      <section className="grid gap-3 xl:grid-cols-2">
        <ListPanel title="当前相信" items={mind.beliefs} empty="暂无需要特别追踪的判断。" />
        <ListPanel title="可能误判" items={mind.misbeliefs} empty="暂无明确误判。" />
      </section>

      <section className="rounded-2xl border border-border/70 bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />推断依据</div>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          {mind.evidence.map((item, index) => <div key={`${mind.id}-${index}`}>• {item}</div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">来源：{mind.sourceType === "artifact_delta" ? "章节定稿后的变化" : mind.sourceType === "bootstrap" ? "角色准备" : "手动刷新"}</Badge>
          {mind.sourceChapterOrder != null ? <Badge variant="outline">来源：第 {mind.sourceChapterOrder} 章{mind.sourceChapterTitle ? `《${mind.sourceChapterTitle}》` : ""}</Badge> : null}
          {typeof mind.confidence === "number" ? <Badge variant="outline">置信度 {Math.round(mind.confidence * 100)}%</Badge> : null}
        </div>
      </section>
      <CharacterDialogueWorkspace
        characterName={selectedCharacter.name}
        session={dialogue}
        isLoading={dialogueQuery.isLoading}
        isCreating={createDialogueMutation.isPending}
        isSending={sendTurnMutation.isPending}
        isActivating={activateInfluenceMutation.isPending}
        isDismissing={dismissInfluenceMutation.isPending}
        message={message}
        onMessageChange={setMessage}
        onCreate={() => createDialogueMutation.mutate()}
        onSend={(sessionId) => sendTurnMutation.mutate({ sessionId, content: message.trim() })}
        onActivate={(sessionId) => activateInfluenceMutation.mutate(sessionId)}
        onDismiss={(sessionId) => dismissInfluenceMutation.mutate(sessionId)}
        error={createDialogueMutation.error ?? sendTurnMutation.error ?? activateInfluenceMutation.error ?? dismissInfluenceMutation.error ?? dialogueQuery.error}
      />
      {refreshMutation.error ? <div className="text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "刷新失败，请稍后重试。"}</div> : null}
    </div>
  );
}

function CharacterDialogueWorkspace(props: {
  characterName: string;
  session: CharacterDialogueSession | null;
  isLoading: boolean;
  isCreating: boolean;
  isSending: boolean;
  isActivating: boolean;
  isDismissing: boolean;
  error: unknown;
  message: string;
  onMessageChange: (value: string) => void;
  onCreate: () => void;
  onSend: (sessionId: string) => void;
  onActivate: (sessionId: string) => void;
  onDismiss: (sessionId: string) => void;
}) {
  const influence = props.session?.latestInfluence ?? null;
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.session && props.message.trim() && !props.isSending) props.onSend(props.session.id);
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4" />和角色聊聊</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">你可以直接说出想问的话。{props.characterName}会按自己的处境、认知和关系回应；谈话不会改写小说正史。</p>
        </div>
      </div>

      {props.isLoading ? <div className="mt-4 text-sm text-muted-foreground">正在读取谈话记录...</div> : null}
      {!props.isLoading && !props.session ? (
        <div className="mt-4 rounded-xl border border-dashed bg-background/60 p-4">
          <p className="text-sm leading-6 text-muted-foreground">从一句话开始，和“{props.characterName}”谈谈此刻的局面、顾虑或选择。</p>
          <AiButton className="mt-3" size="sm" onClick={props.onCreate} disabled={props.isCreating}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />{props.isCreating ? "准备谈话中..." : "开始谈话"}
          </AiButton>
        </div>
      ) : null}
      {props.session ? (
        <>
          <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border bg-background p-3">
            {props.session.turns.length ? props.session.turns.map((turn) => (
              <div key={turn.id} className={turn.role === "author" ? "ml-8 rounded-xl bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground" : "mr-8 rounded-xl bg-muted px-3 py-2 text-sm leading-6"}>
                <div className="mb-1 text-xs opacity-70">{turn.role === "author" ? "你" : props.characterName}</div>
                {turn.content}
              </div>
            )) : <div className="p-2 text-sm leading-6 text-muted-foreground">说说你想和“{props.characterName}”谈的事。</div>}
          </div>
          <form className="mt-3 space-y-2" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor="character-dialogue-message">对角色说的话</label>
            <textarea
              id="character-dialogue-message"
              value={props.message}
              maxLength={800}
              rows={3}
              onChange={(event) => props.onMessageChange(event.target.value)}
              placeholder={`想对“${props.characterName}”说什么？`}
              className="w-full resize-none rounded-xl border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              disabled={props.isSending}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">角色可以同意、犹豫、拒绝或说出自己的顾虑。</span>
              <AiButton type="submit" size="sm" disabled={!props.message.trim() || props.isSending}>
                <Send className="mr-1.5 h-3.5 w-3.5" />{props.isSending ? "回应中..." : "发送"}
              </AiButton>
            </div>
          </form>
          {influence ? <DialogueInfluencePanel influence={influence} isActivating={props.isActivating} isDismissing={props.isDismissing} onActivate={() => props.onActivate(props.session!.id)} onDismiss={() => props.onDismiss(props.session!.id)} /> : null}
        </>
      ) : null}
      {props.error ? <div className="mt-3 text-sm text-destructive">{props.error instanceof Error ? props.error.message : "暂时无法继续这段谈话，请稍后重试。"}</div> : null}
    </section>
  );
}

function DialogueInfluencePanel(props: {
  influence: NonNullable<CharacterDialogueSession["latestInfluence"]>;
  isActivating: boolean;
  isDismissing: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}) {
  const canDecide = props.influence.status === "draft";
  const canDismiss = props.influence.status === "draft" || props.influence.status === "active";
  return (
    <article className="mt-4 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" />这段谈话可能留下的行动倾向</div>
        <Badge variant="outline">{dialogueInfluenceStatusLabel(props.influence.status)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6">{props.influence.summary}</p>
      <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <ProposalField title="后续创作中的倾向" value={props.influence.behaviorGuidance} />
        <ProposalField title="适用章节" value={`第 ${props.influence.targetStartChapterOrder}–${props.influence.targetEndChapterOrder} 章`} />
        {props.influence.emotionalGuidance ? <ProposalField title="情绪变化" value={props.influence.emotionalGuidance} /> : null}
        {props.influence.relationTension ? <ProposalField title="关系张力" value={props.influence.relationTension} /> : null}
      </div>
      {props.influence.resolutionEvidence.length ? <ProposalField title="正文承接依据" value={props.influence.resolutionEvidence.join("；")} className="mt-3" /> : null}
      {canDecide ? <div className="mt-4 flex flex-wrap gap-2"><AiButton size="sm" onClick={props.onActivate} disabled={props.isActivating}>{props.isActivating ? "带入中..." : "带入后续创作"}</AiButton><Button size="sm" variant="ghost" onClick={props.onDismiss} disabled={props.isDismissing}>{props.isDismissing ? "处理中..." : "本次不带入"}</Button></div> : null}
      {!canDecide && canDismiss ? <Button className="mt-3" size="sm" variant="ghost" onClick={props.onDismiss} disabled={props.isDismissing}>{props.isDismissing ? "处理中..." : "本次不带入"}</Button> : null}
    </article>
  );
}

function ProposalField(props: { title: string; value: string; className?: string }) {
  return <div className={props.className}><div className="text-xs font-medium text-muted-foreground">{props.title}</div><div className="mt-1 leading-6">{props.value}</div></div>;
}

function dialogueInfluenceStatusLabel(status: CharacterDialogueInfluenceStatus) {
  const labels: Record<CharacterDialogueInfluenceStatus, string> = {
    draft: "等待决定",
    active: "等待正文承接",
    applied: "已在正文承接",
    expired: "已过适用章节",
    superseded: "已被新的谈话替换",
    dismissed: "本次不带入",
  };
  return labels[status];
}

function MindPanel(props: { title: string; value?: string | null }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-xs font-medium text-muted-foreground">{props.title}</div><div className="mt-2 min-h-12 text-sm leading-6">{props.value || "AI 暂未判断出稳定倾向。"}</div></section>;
}

function ListPanel(props: { title: string; items: string[]; empty: string }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-sm font-medium">{props.title}</div><div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{props.items.length ? props.items.map((item, index) => <div key={`${props.title}-${index}`}>• {item}</div>) : props.empty}</div></section>;
}
