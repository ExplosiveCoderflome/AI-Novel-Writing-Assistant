import { useState } from "react";
import { ResizableWorkspace } from "@/components/layout/resizableWorkspace";
import { ResourceDirectory } from "./ResourceDirectory";
import { ChapterReader } from "./ChapterReader";
import { AssetDetail } from "./AssetDetail";
import { CharacterDrawer } from "./CharacterDrawer";
import { PlanningDetail } from "./PlanningDetail";
import { resolveSelection } from "./model";
import type { Selection, WorkspaceBook } from "./model";
import {resolveSavedReview} from "./review";
import {ReviewDetail} from "./ReviewDetail";

export function NovelWorkspace({ book, preview = false, review, onLeaveReview }: { book: WorkspaceBook; preview?: boolean; review?:URLSearchParams; onLeaveReview?:()=>void }) {
  const savedReview=review ? resolveSavedReview(book,review) : null;
  const [selection, setSelection] = useState<Selection | null>(null);
  const selected = resolveSelection(selection, book);
  const reviewChapterId=savedReview?.execution?.id ?? savedReview?.chapters?.[0]?.id;
  const directorySelected:Selection=savedReview?.plan ? {kind:"plan",id:savedReview.plan.id}
    : reviewChapterId ? {kind:"chapter",id:reviewChapterId} : selected;
  const chapter = selected.kind === "chapter" ? book.chapters.find(row => row.id === selected.id) : null;
  const [readingOrder, setReadingOrder] = useState<number | null>(() => chapter?.order ?? null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const character = book.materials.characters.find(row => row.id === characterId);
  function select(item: Selection) {
    if (savedReview) onLeaveReview?.();
    if (chapter) setReadingOrder(chapter.order);
    setSelection(item);
    if (item.kind === "chapter") setReadingOrder(book.chapters.find(row => row.id === item.id)?.order ?? null);
  }
  function openCharacter(id: string) {
    if (chapter) setReadingOrder(chapter.order);
    setCharacterId(id);
  }
  const directory = <aside>
      <button onClick={()=>setDirectoryOpen(open=>!open)} aria-expanded={directoryOpen} className="mb-3 px-3 py-2 text-xs text-muted-foreground hover:text-primary">{directoryOpen ? "收起本书目录" : "显示本书目录"}</button>
      {directoryOpen ? <ResourceDirectory book={book} selected={directorySelected} onSelect={select} /> : null}
    </aside>;
  const content = savedReview ? <section key={review?.toString()} className="max-h-[75dvh] min-w-0 overflow-y-auto pb-6"><ReviewDetail book={book} review={savedReview}/></section> : <section key={selected.kind + (selected.kind === "beat" ? selected.volumeId : "") + ("id" in selected ? selected.id : "")} className="max-h-[75dvh] min-w-0 overflow-y-auto pb-6">
      <PlanningDetail book={book} selected={selected} onSelect={select} />
      {chapter ? <ChapterReader key={chapter.id} chapter={chapter} chapters={book.chapters} characters={book.materials.characters} onCharacter={openCharacter} onChapter={id => select({kind:"chapter",id})} />
        : selected.kind === "beat" || selected.kind === "plan" || (selected.kind === "volume" && book.planning) ? null : <AssetDetail book={book} selected={selected} onCharacter={openCharacter} />}
    </section>;
  return <div className="min-w-0">
    {directoryOpen ? <ResizableWorkspace id="director-resource-layout" label="调整目录与正文宽度" defaultLeft={27} minLeft={180} minRight={340} breakpoint={560} left={directory} right={content}/> : <>{directory}{content}</>}
    {character ? <CharacterDrawer key={character.id} book={book} character={character} readingOrder={chapter?.order ?? readingOrder} preview={preview} onClose={() => setCharacterId(null)} onChapter={id => select({kind:"chapter",id})} /> : null}
  </div>;
}
