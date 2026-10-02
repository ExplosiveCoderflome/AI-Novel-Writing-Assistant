import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCharacterTimeline } from "@/api/novel";
import { getCharacterDynamicsOverview } from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { visibleCharacterHistory } from "./model";
import type { WorkspaceBook, WorkspaceCharacter } from "./model";
import { previewCharacterHistory } from "./previewBook";

export function CharacterDrawer({ book, character, readingOrder, preview, onClose, onChapter }: {
  book: WorkspaceBook; character: WorkspaceCharacter; readingOrder: number | null; preview: boolean;
  onClose: () => void; onChapter: (id: string) => void;
}) {
  const [latest, setLatest] = useState(false);
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <AppDialogContent title={character.name} description="查看角色变化及其章节来源" className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-md translate-x-0 translate-y-0 rounded-none sm:w-[420px]">
      <div className="flex gap-2" role="group" aria-label="角色记录范围">
        <Button size="sm" variant={!latest ? "default" : "ghost"} onClick={() => setLatest(false)}>读到本章</Button>
        <Button size="sm" variant={latest ? "default" : "ghost"} onClick={() => setLatest(true)}>最新状态</Button>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{latest ? "包含全书已保存的记录，可能透露后续剧情。" : readingOrder === null ? "先选择一个阅读章节，再查看对应范围的变化记录。" : `仅展示第 ${readingOrder} 章及以前的变化记录。`}</p>
      {latest ? <section className="mt-6 space-y-3 rounded-md bg-muted/40 p-4">
        <h3 className="text-sm font-medium">最新保存状态</h3>
        {!preview && latestQuery.isError ? <p role="alert" className="text-sm text-destructive">最新状态读取失败。<Button size="sm" variant="ghost" onClick={() => void latestQuery.refetch()}>重新读取</Button></p>
          : latestQuery.isLoading && !preview ? <p className="text-sm text-muted-foreground">正在读取最新状态…</p>
            : <><p className="whitespace-pre-wrap text-sm leading-7">{currentState || "暂无状态描述"}</p><p className="whitespace-pre-wrap text-sm leading-7"><span className="text-muted-foreground">行动目标：</span>{currentGoal || "暂无行动目标"}</p><p className="text-xs text-muted-foreground">此状态未提供逐章历史快照。</p></>}
      </section> : null}
      <section className="mt-7"><h3 className="text-sm font-semibold">变化记录</h3>
        {!preview && historyQuery.isError ? <p role="alert" className="mt-4 text-sm text-destructive">变化记录读取失败。<Button size="sm" variant="ghost" onClick={() => void historyQuery.refetch()}>重新读取</Button></p>
          : !preview && historyQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">正在读取变化记录…</p>
            : history.length === 0 ? <p className="mt-4 text-sm leading-7 text-muted-foreground">{readingOrder === null && !latest ? "尚未选择阅读章节。" : "这个范围暂无有来源的变化记录。角色资料可在下方查看。"}</p>
              : <ol className="mt-3 divide-y divide-border/50">{history.map(event => {
                const source = book.chapters.find(chapter => event.chapterId ? chapter.id === event.chapterId : chapter.order === event.chapterOrder);
                return <li key={event.id} className="space-y-2 py-4"><h4 className="text-sm font-medium">{event.title}</h4><p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">{event.content}</p>
                  {source ? <Button size="sm" variant="ghost" className="-ml-3 text-xs text-primary" onClick={() => { onChapter(source.id); onClose(); }}>来源：第 {source.order} 章 · {source.title}</Button>
                    : <p className="text-xs text-muted-foreground">{typeof event.chapterOrder === "number" ? `来源：第 ${event.chapterOrder} 章（正文未在目录中）` : "章节来源未标注"}</p>}
                </li>;
              })}</ol>}
      </section>
      <details className="mt-6 border-t border-border/50 pt-5"><summary className="cursor-pointer text-sm font-medium">角色设定 · 全书资料</summary><dl className="mt-4 space-y-4 text-sm leading-7">
        <div><dt className="text-muted-foreground">身份</dt><dd>{character.role}</dd></div><div><dt className="text-muted-foreground">性格</dt><dd>{character.personality || "尚未填写"}</dd></div><div><dt className="text-muted-foreground">故事作用</dt><dd>{character.storyFunction || "尚未填写"}</dd></div>
      </dl></details>
    </AppDialogContent>
  </Dialog>;
}
