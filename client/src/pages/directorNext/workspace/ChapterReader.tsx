import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorkspaceBook, WorkspaceChapter } from "./model";

export function ChapterReader({ chapter, characters, onCharacter, onChapter, chapters }: {
  chapter: WorkspaceChapter; characters: WorkspaceBook["materials"]["characters"];
  onCharacter: (id: string) => void; onChapter: (id: string) => void; chapters: WorkspaceChapter[];
}) {
  // Keep the opened edition while polling. Updating prose is an explicit reader action.
  const [edition, setEdition] = useState(chapter);
  const changed = edition.updatedAt !== chapter.updatedAt || edition.content !== chapter.content;
  const index = chapters.findIndex(row => row.id === chapter.id);
  return <article className="mx-auto max-w-[42rem] px-2 pb-10 sm:px-6" aria-label="章节正文">
    <div className="mb-9 space-y-3 border-b border-border/50 pb-6">
      <p className="text-xs tracking-widest text-muted-foreground">第 {edition.order} 章 · {edition.wordCount.toLocaleString()} 字</p>
      <h2 className="text-2xl font-semibold tracking-wide">{edition.title}</h2>
      {changed ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">本章有新保存的内容<Button size="sm" variant="outline" onClick={() => setEdition(chapter)}>查看新内容</Button></div> : null}
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-2 text-xs text-muted-foreground">快速查看角色</span>{characters.map(character => <Button key={character.id} size="sm" variant="ghost" onClick={() => onCharacter(character.id)}>{character.name}</Button>)}{characters.length === 0 ? <span className="text-xs text-muted-foreground">暂无角色资料</span> : null}</div>
    </div>
    {edition.content?.trim() ? <div className="space-y-6 font-serif text-[17px] leading-[2.15] tracking-wide text-foreground/90">{edition.content.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</div>
      : <div className="py-16 text-center"><p className="text-lg font-medium">这一章等待写作</p><p className="mt-3 text-sm text-muted-foreground">正文保存后可在这里阅读。你可以先查看故事规划和角色资料。</p></div>}
    <footer className="mt-12 flex justify-between gap-3 border-t border-border/50 pt-5">
      <Button variant="ghost" disabled={index <= 0} onClick={() => onChapter(chapters[index - 1].id)}>上一章</Button>
      <Button variant="ghost" disabled={index < 0 || index >= chapters.length - 1} onClick={() => onChapter(chapters[index + 1].id)}>下一章</Button>
    </footer>
  </article>;
}
