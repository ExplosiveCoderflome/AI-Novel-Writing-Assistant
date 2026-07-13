import type { FormEvent } from "react";
import type { CharacterDialogueInfluence, CharacterDialogueInfluenceStatus } from "@ai-novel/shared/types/characterDialogue";
import type { CharacterConversationPolicy } from "@ai-novel/shared/types/characterConversation";
import type { CharacterConversationSessionView } from "@/api/characterConversation";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CharacterDialogueStageProps {
  className?: string;
  characterName: string;
  interactionPolicy: CharacterConversationPolicy;
  session: CharacterConversationSessionView | null;
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
}

const POLICY_DESCRIPTION: Record<CharacterConversationPolicy, string> = {
  novel_influence: "角色会按自己的处境、认知和关系回应；谈话不会直接改写小说正史。",
  read_only: "角色依据角色库中的稳定设定回应；这段交流不会改写角色设定或任何小说。",
  evidence_interview: "角色只依据当前证据范围回应；证据不足时会明确说明，交流不会改写原文。",
};

export default function CharacterDialogueStage(props: CharacterDialogueStageProps) {
  const influence = props.interactionPolicy === "novel_influence" ? props.session?.latestInfluence ?? null : null;
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.session && props.message.trim() && !props.isSending) {
      props.onSend(props.session.id);
    }
  };

  return (
    <section className={cn("flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:max-h-[calc(100dvh-15rem)]", props.className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),hsl(var(--background))_58%)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4 text-primary" />
            和 {props.characterName} 聊聊
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{POLICY_DESCRIPTION[props.interactionPolicy]}</p>
        </div>
        {props.session ? <Badge variant="secondary">谈话进行中</Badge> : <Badge variant="outline">等待开启</Badge>}
      </header>

      {props.isLoading ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">正在读取谈话记录...</div> : null}
      {!props.isLoading && !props.session ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="h-5 w-5" /></div>
          <div className="mt-4 text-base font-semibold">从一句话开始</div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">可以询问 {props.characterName} 的顾虑、质疑他的选择，或聊聊他眼前的局面。</p>
          <AiButton className="mt-5" onClick={props.onCreate} disabled={props.isCreating}>
            <Sparkles className="mr-1.5 h-4 w-4" />{props.isCreating ? "准备谈话中..." : `开启与${props.characterName}的谈话`}
          </AiButton>
        </div>
      ) : null}
      {props.session ? (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/[0.18] px-5 py-5">
            {props.session.turns.length ? props.session.turns.map((turn) => (
              <article key={turn.id} className={turn.role === "author" ? "ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-primary-foreground shadow-sm" : "mr-auto max-w-[88%] rounded-2xl rounded-tl-md border border-border/70 bg-background px-4 py-3 shadow-sm"}>
                <div className={`mb-1.5 text-xs font-medium ${turn.role === "author" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{turn.role === "author" ? "你" : props.characterName}</div>
                <div className="whitespace-pre-wrap text-sm leading-7">{turn.content}</div>
                {turn.role === "character" && turn.uncertainty ? <div className="mt-3 border-t border-border/50 pt-2 text-xs leading-5 text-muted-foreground">{turn.uncertainty}</div> : null}
                {turn.role === "character" && turn.evidence.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">{turn.evidence.map((evidence, index) => <Badge key={`${evidence.sourceRef ?? evidence.label}-${index}`} variant="outline" className="max-w-full truncate text-[10px]">{evidence.chapterOrder ? `第 ${evidence.chapterOrder} 章 · ` : ""}{evidence.label}</Badge>)}</div> : null}
              </article>
            )) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">说说你想和 {props.characterName} 谈的事。</div>}
          </div>
          {influence ? <DialogueInfluenceNotice influence={influence} isActivating={props.isActivating} isDismissing={props.isDismissing} onActivate={() => props.onActivate(props.session!.id)} onDismiss={() => props.onDismiss(props.session!.id)} /> : null}
          <form className="border-t border-border/60 bg-background p-4" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor="character-dialogue-message">对角色说的话</label>
            <textarea
              id="character-dialogue-message"
              value={props.message}
              maxLength={800}
              rows={3}
              onChange={(event) => props.onMessageChange(event.target.value)}
              placeholder={`想对“${props.characterName}”说什么？`}
              className="w-full resize-none rounded-2xl border bg-muted/[0.18] px-4 py-3 text-sm leading-6 outline-none transition focus:bg-background focus:ring-2 focus:ring-ring"
              disabled={props.isSending}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{props.message.length}/800</span>
              <AiButton type="submit" size="sm" disabled={!props.message.trim() || props.isSending}>
                <Send className="mr-1.5 h-3.5 w-3.5" />{props.isSending ? "等待回应..." : "发送"}
              </AiButton>
            </div>
          </form>
        </>
      ) : null}
      {props.error ? <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{props.error instanceof Error ? props.error.message : "暂时无法继续这段谈话，请稍后重试。"}</div> : null}
    </section>
  );
}

function DialogueInfluenceNotice(props: {
  influence: CharacterDialogueInfluence;
  isActivating: boolean;
  isDismissing: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}) {
  const canDecide = props.influence.status === "draft";
  const canDismiss = props.influence.status === "draft" || props.influence.status === "active";
  return (
    <aside className="border-t border-amber-200/70 bg-amber-50/70 px-5 py-4 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">这段谈话留下的倾向</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.influence.summary}</p>
        </div>
        <Badge variant="outline">{influenceStatusLabel(props.influence.status)}</Badge>
      </div>
      {canDecide ? <div className="mt-3 flex flex-wrap gap-2"><AiButton size="sm" onClick={props.onActivate} disabled={props.isActivating}>{props.isActivating ? "带入中..." : "带入后续创作"}</AiButton><Button size="sm" variant="ghost" onClick={props.onDismiss} disabled={props.isDismissing}>{props.isDismissing ? "处理中..." : "本次不带入"}</Button></div> : null}
      {!canDecide && canDismiss ? <Button className="mt-3" size="sm" variant="ghost" onClick={props.onDismiss} disabled={props.isDismissing}>{props.isDismissing ? "处理中..." : "本次不带入"}</Button> : null}
    </aside>
  );
}

function influenceStatusLabel(status: CharacterDialogueInfluenceStatus) {
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
