import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCharacterTimeline } from "@/api/novel";
import { getCharacterDynamicsOverview } from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { visibleCharacterHistory } from "./model";
import type { WorkspaceBook, WorkspaceCharacter } from "./model";
import { previewCharacterHistory } from "./previewBook";
import {CharacterAppearances} from "./characters/CharacterAppearances";
import { characterForwardPreviewKey, getCharacterForwardPreview } from "@/api/characterForwardAdjustment";
import type { CharacterForwardPreview } from "@ai-novel/shared/types/characterForwardAdjustment";
import { CharacterProfileEditor, type CharacterProfileEditorHandle } from "./characters/CharacterProfileEditor";

export function CharacterDrawer({ book, character, readingOrder, preview, onClose, onChapter, onPlan, onResources, onAdjust, editingProfile, onProfileEditingChange }: {
  book: WorkspaceBook; character: WorkspaceCharacter; readingOrder: number | null; preview: boolean;
  onClose: () => void; onChapter: (id: string) => void; onPlan: (id: string) => void;
  onResources?: (id:string) => void;
  onAdjust?: (preview: CharacterForwardPreview) => void;
  editingProfile: boolean;
  onProfileEditingChange: (editing: boolean) => void;
}) {
  const [latest, setLatest] = useState(false);
  const profileEditor = useRef<CharacterProfileEditorHandle>(null);
  const profileButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (editingProfile) backButton.current?.focus();
  }, [editingProfile]);
  const historyQuery = useQuery({
    queryKey: ["director-workspace", "character-history", book.novel.id, character.id],
    queryFn: () => getCharacterTimeline(book.novel.id, character.id), enabled: !preview, retry: false, refetchInterval: 10000,
  });
  // The existing overview contains mutable latest fields even when chapterOrder is supplied.
  // Request/display it only after the reader explicitly chooses latest state.
  const latestQuery = useQuery({
    queryKey: queryKeys.novels.characterDynamicsOverview(book.novel.id),
    queryFn: () => getCharacterDynamicsOverview(book.novel.id), enabled: !preview && latest, retry: false, refetchInterval: 10000,
  });
  const history = visibleCharacterHistory(preview ? previewCharacterHistory[character.id] ?? [] : historyQuery.data?.data ?? [], latest ? "latest" : readingOrder);
  const latestCharacter = latestQuery.data?.data?.characters.find(row => row.characterId === character.id);
  const currentGoal = preview ? character.currentGoal : latestCharacter?.currentGoal;
  const currentState = preview ? (character.id === "lin" ? "接纳沈知入城，开始调查旧城印记。" : null) : latestCharacter?.currentState;
  const adjustmentQuery = useQuery({
    queryKey: characterForwardPreviewKey(book.novel.id, character.id),
    queryFn: () => getCharacterForwardPreview(book.novel.id, character.id),
    enabled: !preview && !!onAdjust, retry: false, refetchInterval: 10000,
  });
  const adjustment = adjustmentQuery.data;
  function requestExit(exit: () => void) {
    if (editingProfile && profileEditor.current) profileEditor.current.requestExit(exit);
    else exit();
  }
  function returnToProfile() {
    onProfileEditingChange(false);
    requestAnimationFrame(() => profileButton.current?.focus());
  }
  function leaveDrawer(navigate?: () => void) {
    requestExit(() => {
      if (editingProfile) onProfileEditingChange(false);
      navigate?.();
      onClose();
    });
  }
  return <Dialog open onOpenChange={open => { if (!open) leaveDrawer(); }}>
    <AppDialogContent
      title={editingProfile ? `编辑角色资料 · ${character.name}` : character.name}
      description={editingProfile ? "对照建议，逐项采纳后保存。" : "查看角色变化及其章节来源"}
      className={cn("left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out",
        editingProfile ? "md:w-[min(64rem,calc(100vw_-_2rem))] xl:w-[min(80rem,calc(100vw_-_2rem))]" : "sm:w-[420px]")}
      bodyClassName="flex flex-col overflow-hidden p-0">
      {editingProfile && <div className="shrink-0 border-b border-border/60 px-4 py-2">
        <Button ref={backButton} size="sm" variant="ghost" onClick={() => requestExit(returnToProfile)}>
          <ArrowLeft className="size-4" aria-hidden="true"/>返回角色档案
        </Button>
      </div>}
      <div className="flex min-h-0 min-w-0 flex-1">
      {editingProfile && <CharacterProfileEditor ref={profileEditor} novelId={book.novel.id} character={character} onSaved={returnToProfile}/>}
      <section aria-label="角色档案" className={cn("min-w-0 overflow-y-auto overscroll-contain px-6 py-4",
        editingProfile ? "hidden w-80 shrink-0 border-l border-border/60 xl:block" : "flex-1")}>
      {editingProfile && <h3 className="mb-4 text-sm font-semibold">角色档案</h3>}
      {!preview && !editingProfile && <div className="mb-4 border-b border-border/60 pb-4">
        <Button ref={profileButton} size="sm" onClick={() => onProfileEditingChange(true)}><Sparkles aria-hidden="true" className="size-4"/>与 AI 编辑角色资料</Button>
      </div>}
      <div className="flex gap-2" role="group" aria-label="角色记录范围">
        <Button size="sm" variant={!latest ? "default" : "ghost"} onClick={() => setLatest(false)}>读到本章</Button>
        <Button size="sm" variant={latest ? "default" : "ghost"} onClick={() => setLatest(true)}>最新状态</Button>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{latest ? "包含全书已保存的记录，可能透露后续剧情。" : readingOrder === null ? "先选择一个阅读章节，再查看对应范围的变化记录。" : `仅展示第 ${readingOrder} 章及以前的变化记录。`}</p>
      {!editingProfile && onResources ? <Button size="sm" variant="ghost" className="mt-3" onClick={()=>onResources(character.id)}>查看背包与资源</Button> : null}
      {!editingProfile && !preview && onAdjust ? <div className="mt-3 space-y-2">
        <Button size="sm" variant="outline" disabled={!adjustment || !!adjustment.blockedReason || adjustmentQuery.isError}
          onClick={() => { if (adjustment) onAdjust(adjustment); }}>从后续章节起调整</Button>
        {adjustmentQuery.isError ? <p role="alert" className="text-xs text-destructive">
          {adjustmentQuery.error.message}<Button size="sm" variant="ghost" onClick={() => void adjustmentQuery.refetch()}>重试</Button>
        </p> : adjustment?.blockedReason ? <p className="text-xs text-muted-foreground">{adjustment.blockedReason}</p> : null}
      </div> : null}
      {latest ? <section className="mt-6 space-y-3 rounded-md bg-muted/40 p-4">
        <h3 className="text-sm font-medium">最新保存状态</h3>
        {!preview && latestQuery.isError ? <p role="alert" className="text-sm text-destructive">最新状态读取失败。<Button size="sm" variant="ghost" onClick={() => void latestQuery.refetch()}>重新读取</Button></p>
          : latestQuery.isLoading && !preview ? <p className="text-sm text-muted-foreground">正在读取最新状态…</p>
            : <><p className="whitespace-pre-wrap text-sm leading-7">{currentState || "暂无状态描述"}</p><p className="whitespace-pre-wrap text-sm leading-7"><span className="text-muted-foreground">行动目标：</span>{currentGoal || "暂无行动目标"}</p><p className="text-xs text-muted-foreground">此状态未提供逐章历史快照。</p></>}
      </section> : null}
      <CharacterAppearances novelId={book.novel.id} characterId={character.id} preview={preview} boundary={latest ? "latest" : readingOrder} planning={book.planning} notices={book.characterForwardPlanNotices}
        onSelect={target => leaveDrawer(() => (target.kind === "chapter" ? onChapter : onPlan)(target.id))}/>
      <section className="mt-7"><h3 className="text-sm font-semibold">其他变化记录</h3>
        {!preview && historyQuery.isError ? <p role="alert" className="mt-4 text-sm text-destructive">变化记录读取失败。<Button size="sm" variant="ghost" onClick={() => void historyQuery.refetch()}>重新读取</Button></p>
          : !preview && historyQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">正在读取变化记录…</p>
            : history.length === 0 ? <p className="mt-4 text-sm leading-7 text-muted-foreground">{readingOrder === null && !latest ? "尚未选择阅读章节。" : "这个范围暂无有来源的变化记录。角色资料可在下方查看。"}</p>
              : <ol className="mt-3 divide-y divide-border/50">{history.map(event => {
                const source = book.chapters.find(chapter => event.chapterId ? chapter.id === event.chapterId : chapter.order === event.chapterOrder);
                return <li key={event.id} className="space-y-2 py-4"><h4 className="text-sm font-medium">{event.title}</h4><p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">{event.content}</p>
                  {source ? <Button size="sm" variant="ghost" className="-ml-3 text-xs text-primary" onClick={() => leaveDrawer(() => onChapter(source.id))}>来源：第 {source.order} 章 · {source.title}</Button>
                    : <p className="text-xs text-muted-foreground">{typeof event.chapterOrder === "number" ? `来源：第 ${event.chapterOrder} 章（正文未在目录中）` : "章节来源未标注"}</p>}
                </li>;
              })}</ol>}
      </section>
      <details className="mt-6 border-t border-border/50 pt-5"><summary className="cursor-pointer text-sm font-medium">角色设定 · 全书资料</summary><dl className="mt-4 space-y-4 text-sm leading-7">
        <div><dt className="text-muted-foreground">身份</dt><dd>{character.role}</dd></div><div><dt className="text-muted-foreground">性格</dt><dd>{character.personality || "尚未填写"}</dd></div><div><dt className="text-muted-foreground">故事作用</dt><dd>{character.storyFunction || "尚未填写"}</dd></div>
      </dl></details>
      </section>
      </div>
    </AppDialogContent>
  </Dialog>;
}
