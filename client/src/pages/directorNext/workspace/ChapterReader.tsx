import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkspaceBook, WorkspaceChapter } from "./model";
import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";

export function ChapterReader({ chapter, characters, onCharacter, onChapter, chapters, generation = null, followGeneration = false }: {
  chapter: WorkspaceChapter; characters: WorkspaceBook["materials"]["characters"];
  onCharacter: (id: string) => void; onChapter: (id: string) => void; chapters: WorkspaceChapter[];
  generation?: DirectorGenerationSnapshot | null; followGeneration?: boolean;
}) {
  // Keep the opened edition while polling. Updating prose is an explicit reader action.
  const [edition, setEdition] = useState(chapter);
  useEffect(() => { if (followGeneration) setEdition(chapter); }, [chapter, followGeneration]);
  const live = followGeneration && generation?.chapterId === chapter.id ? generation : null;
  const content = live?.content ?? edition.content;
  const changed = !followGeneration && (edition.updatedAt !== chapter.updatedAt || edition.content !== chapter.content);
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live?.state !== "writing" || !tail.current) return;
    const viewport = tail.current.closest<HTMLElement>("[data-chapter-scroll-viewport]");
    if (!viewport) return;
    // Follow only within the reader; scrollIntoView also moves outer page containers.
    viewport.scrollTop += Math.max(0, tail.current.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom);
  }, [live?.executionId, live?.revision]);
  const index = chapters.findIndex(row => row.id === chapter.id);
  return <article className="mx-auto max-w-[42rem] px-2 pb-10 sm:px-6" aria-label="章节正文">
    <div className="mb-9 space-y-3 border-b border-border/50 pb-6">
      <p className="text-xs tracking-widest text-muted-foreground">第 {edition.order} 章 · {(live ? live.content.replace(/\s/g, "").length : edition.wordCount).toLocaleString()} 字</p>
      <h2 className="text-2xl font-semibold tracking-wide">{edition.title}</h2>
      {live ? <p role="status" className="text-xs text-muted-foreground">{live.state === "writing" ? "正在生成正文 · 实时预览" : live.state === "checking" ? "正文生成完成，正在检查与保存" : live.state === "saved" ? "正文已保存" : "生成已中断，请查看导演台的处理提示。正文以保存版为准。"}</p> : null}
      {changed ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">本章有新保存的内容<Button size="sm" variant="outline" onClick={() => setEdition(chapter)}>查看新内容</Button></div> : null}
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-2 text-xs text-muted-foreground">快速查看角色</span>{characters.map(character => <Button key={character.id} size="sm" variant="ghost" onClick={() => onCharacter(character.id)}>{character.name}</Button>)}{characters.length === 0 ? <span className="text-xs text-muted-foreground">暂无角色资料</span> : null}</div>
    </div>
    {content?.trim() ? <div className="space-y-6 font-serif text-[17px] leading-[2.15] tracking-wide text-foreground/90">{content.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}{live?.state === "writing" ? <span aria-hidden="true" className="inline-block h-5 w-1 animate-pulse bg-primary"/> : null}</div>
      : live?.state === "writing" ? <p className="py-16 text-center text-sm text-muted-foreground">正在准备正文输出…</p>
      : <div className="py-16 text-center"><p className="text-lg font-medium">这一章等待写作</p><p className="mt-3 text-sm text-muted-foreground">正文保存后可在这里阅读。你可以先查看故事规划和角色资料。</p></div>}
    <div ref={tail}/>
    <footer className="mt-12 flex justify-between gap-3 border-t border-border/50 pt-5">
      <Button variant="ghost" disabled={index <= 0} onClick={() => onChapter(chapters[index - 1].id)}>上一章</Button>
      <Button variant="ghost" disabled={index < 0 || index >= chapters.length - 1} onClick={() => onChapter(chapters[index + 1].id)}>下一章</Button>
    </footer>
  </article>;
}
