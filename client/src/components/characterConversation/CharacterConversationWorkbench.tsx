import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CharacterConversationPolicy,
  CharacterSubjectProjection,
  CharacterSubjectRef,
} from "@ai-novel/shared/types/characterConversation";
import {
  activateCharacterConversationInfluence,
  createCharacterConversationSession,
  dismissCharacterConversationInfluence,
  getActiveCharacterConversationSession,
  getCharacterConversationContext,
  sendCharacterConversationTurn,
} from "@/api/characterConversation";
import FullscreenView from "@/components/common/FullscreenView";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CharacterDialogueStage from "@/pages/novels/components/characterWorkspace/CharacterDialogueStage";
import { BookOpenText, MessageCircle, ShieldCheck } from "lucide-react";

interface CharacterConversationWorkbenchProps {
  subject: CharacterSubjectRef;
  characterName: string;
  chapterAnchor?: number | null;
  chapterAnchorOptions?: number[];
  onChapterAnchorChange?: (chapterAnchor: number) => void;
  sidePanel?: ReactNode;
  headerActions?: ReactNode;
  defaultFullscreen?: boolean;
  closeOnExitFullscreen?: boolean;
  onClose?: () => void;
}

export default function CharacterConversationWorkbench(props: CharacterConversationWorkbenchProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(props.defaultFullscreen ?? false);
  const request = useMemo(() => ({
    ...props.subject,
    chapterAnchor: props.chapterAnchor ?? undefined,
  }), [props.chapterAnchor, props.subject]);
  const queryKey = ["character-conversations", request.kind, request.id, request.scopeKind, request.scopeId ?? "global", request.chapterAnchor ?? "latest"] as const;
  const contextQuery = useQuery({
    queryKey: [...queryKey, "context"],
    queryFn: () => getCharacterConversationContext(request),
  });
  const sessionQuery = useQuery({
    queryKey: [...queryKey, "active-session"],
    queryFn: () => getActiveCharacterConversationSession(request),
  });
  const projection = contextQuery.data?.data?.projection;
  const session = sessionQuery.data?.data ?? contextQuery.data?.data?.activeSession ?? null;
  const policy = projection?.interactionPolicy ?? policyForSubject(props.subject.kind);
  const useCompactReadOnlyLayout = policy === "read_only" && !isFullscreen;
  const invalidateConversation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...queryKey, "context"] }),
      queryClient.invalidateQueries({ queryKey: [...queryKey, "active-session"] }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: () => createCharacterConversationSession(request),
    onSuccess: invalidateConversation,
  });
  const sendMutation = useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) => sendCharacterConversationTurn(sessionId, request, { message: content }),
    onSuccess: async () => {
      setMessage("");
      await invalidateConversation();
    },
  });
  const activateMutation = useMutation({
    mutationFn: (sessionId: string) => activateCharacterConversationInfluence(sessionId, request),
    onSuccess: invalidateConversation,
  });
  const dismissMutation = useMutation({
    mutationFn: (sessionId: string) => dismissCharacterConversationInfluence(sessionId, request),
    onSuccess: invalidateConversation,
  });
  const error = contextQuery.error ?? sessionQuery.error ?? createMutation.error ?? sendMutation.error ?? activateMutation.error ?? dismissMutation.error;
  const displayName = projection?.name || props.characterName;
  const sidePanel = props.sidePanel ?? <ConversationContextPanel projection={projection} />;
  const handleFullscreenChange = (next: boolean) => {
    setIsFullscreen(next);
    if (!next && props.closeOnExitFullscreen) {
      props.onClose?.();
    }
  };

  return (
    <FullscreenView
      fullscreen={isFullscreen}
      onFullscreenChange={handleFullscreenChange}
      title={<span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" />{displayName} 的对话空间</span>}
      description={projection?.sourceDescription ?? sourceDescriptionForPolicy(policy)}
      meta={<span className="text-xs font-medium text-muted-foreground">{projection?.sourceLabel ?? sourceLabelForPolicy(policy)} · {policyLabel(policy)}</span>}
      actions={<>{props.headerActions}{props.chapterAnchorOptions?.length && typeof props.chapterAnchor === "number" && props.onChapterAnchorChange ? <ChapterAnchorSelect chapterAnchor={props.chapterAnchor} options={props.chapterAnchorOptions} disabled={Boolean(session)} onChange={props.onChapterAnchorChange} /> : null}{props.onClose ? <Button size="sm" variant="ghost" onClick={props.onClose}>收起谈话</Button> : null}</>}
      className="rounded-xl border-border/50 shadow-none"
      headerClassName="bg-background px-5 py-4 xl:px-6"
      bodyClassName={cn(
        "grid min-w-0 xl:grid-cols-[minmax(0,1fr)_340px]",
        useCompactReadOnlyLayout
          ? "min-h-[420px] xl:h-[54rem] xl:max-h-[calc(100dvh-10rem)] xl:min-h-0"
          : "min-h-[580px]",
      )}
      fullscreenBodyClassName="min-h-0 min-w-0 overflow-y-auto xl:h-full xl:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className={cn(
        "min-h-0 min-w-0 border-b border-border/50 bg-background px-4 py-4 xl:border-b-0 xl:border-r xl:px-6 xl:py-5",
        useCompactReadOnlyLayout && "xl:h-full xl:self-stretch",
      )}>
        <CharacterDialogueStage
          className={cn(
            "xl:h-full xl:min-h-0 xl:max-h-none",
            useCompactReadOnlyLayout && "min-h-[420px]",
          )}
          characterName={displayName}
          interactionPolicy={policy}
          session={session}
          isLoading={contextQuery.isLoading || sessionQuery.isLoading}
          isCreating={createMutation.isPending}
          isSending={sendMutation.isPending}
          isActivating={activateMutation.isPending}
          isDismissing={dismissMutation.isPending}
          message={message}
          onMessageChange={setMessage}
          onCreate={() => createMutation.mutate()}
          onSend={(sessionId) => sendMutation.mutate({ sessionId, content: message.trim() })}
          onActivate={(sessionId) => activateMutation.mutate(sessionId)}
          onDismiss={(sessionId) => dismissMutation.mutate(sessionId)}
          error={error}
        />
      </div>
      <div className={cn(
        "min-h-0 min-w-0 bg-muted/[0.16] px-4 py-5 xl:px-6",
        useCompactReadOnlyLayout ? "xl:h-full xl:max-h-none xl:overflow-y-auto" : "xl:overflow-y-auto",
      )}>{sidePanel}</div>
    </FullscreenView>
  );
}

function ChapterAnchorSelect(props: { chapterAnchor: number; options: number[]; disabled: boolean; onChange: (chapterAnchor: number) => void }) {
  return <label className="flex h-8 items-center gap-1.5 border-b border-border/70 px-1 text-xs text-muted-foreground"><span>截至</span><select className="bg-transparent text-sm font-medium text-foreground outline-none" value={props.chapterAnchor} onChange={(event) => props.onChange(Number(event.target.value))} disabled={props.disabled}>{props.options.map((chapterOrder) => <option key={chapterOrder} value={chapterOrder}>第 {chapterOrder} 章</option>)}</select></label>;
}

function ConversationContextPanel(props: { projection: CharacterSubjectProjection | undefined }) {
  if (!props.projection) {
    return <aside className="flex min-h-40 items-center border-l-2 border-primary/30 pl-4 text-sm leading-6 text-muted-foreground">正在整理角色的谈话依据...</aside>;
  }
  const { projection } = props;
  return (
    <aside className="min-w-0 pb-6">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-tight"><ShieldCheck className="h-4 w-4 text-primary" />场景分析</div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{projection.sourceDescription}</p>
      {projection.chapterAnchorLabel ? <div className="mt-4 text-xs font-medium text-primary">{projection.chapterAnchorLabel}</div> : null}
      <section className="mt-5 border-l-2 border-primary/45 pl-4">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-primary">角色基础</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{projection.identity}</p>
      </section>
      <section className="mt-6 border-t border-border/60 pt-5">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">此刻处境</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{projection.currentSituation}</p>
      </section>
      {projection.evidence.length > 0 ? <section className="mt-6 border-t border-border/60 pt-5"><div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground"><BookOpenText className="h-3.5 w-3.5" />回应依据</div><div className="mt-3 space-y-3">{projection.evidence.map((evidence, index) => <article key={`${evidence.sourceRef ?? evidence.label}-${index}`} className="border-l border-border/80 pl-3"><div className="text-xs font-medium text-foreground/90">{evidence.chapterOrder ? `第 ${evidence.chapterOrder} 章 · ` : ""}{evidence.label}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{evidence.detail}</p></article>)}</div></section> : null}
      <section className="mt-6 border-t border-border/60 pt-5"><div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">交流边界</div><ul className="mt-2.5 space-y-2 text-xs leading-5 text-muted-foreground">{projection.hardBoundaries.map((boundary) => <li key={boundary}>{boundary}</li>)}</ul></section>
    </aside>
  );
}

function policyForSubject(kind: CharacterSubjectRef["kind"]): CharacterConversationPolicy {
  if (kind === "novel_character") return "novel_influence";
  if (kind === "book_analysis_character") return "evidence_interview";
  return "read_only";
}

function policyLabel(policy: CharacterConversationPolicy) {
  return policy === "novel_influence" ? "可带入创作" : policy === "evidence_interview" ? "证据访谈" : "只读访谈";
}

function sourceLabelForPolicy(policy: CharacterConversationPolicy) {
  return policy === "novel_influence" ? "小说角色" : policy === "evidence_interview" ? "拆书角色档案" : "基础角色库";
}

function sourceDescriptionForPolicy(policy: CharacterConversationPolicy) {
  return policy === "novel_influence"
    ? "角色会结合当前小说处境回应；只有你确认后，谈话倾向才会带入后续创作。"
    : policy === "evidence_interview"
      ? "角色只依据选定章节范围内的原文证据回应，不会改写原文。"
      : "角色依据角色库中的稳定设定回应；交流只用于理解人物，不会改写设定。";
}
