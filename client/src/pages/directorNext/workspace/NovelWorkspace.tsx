import { useEffect, useState } from "react";
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
import type {DirectorGenerationSnapshot} from "@ai-novel/shared/types/director/generation";
import {followedChapterSelection} from "../generation";
import type {WorkspaceChapter} from "./model";

export function NovelWorkspace({ book, preview = false, review, onLeaveReview, followGeneration = false, generation = null }: { book: WorkspaceBook; preview?: boolean; review?:URLSearchParams; onLeaveReview?:()=>void; followGeneration?:boolean; generation?:DirectorGenerationSnapshot|null }) {
  const live = followGeneration && generation?.novelId === book.novel.id ? generation : null;
  // Planning/polling may not yet include the newly created chapter. The preview is read-only.
  const previewChapter: WorkspaceChapter | null = live ? {id:live.chapterId,order:live.chapterOrder,title:live.chapterTitle,
    content:null,wordCount:0,status:"generating",updatedAt:"",qualityDebt:null} : null;
  const displayBook = previewChapter && !book.chapters.some(row=>row.id===previewChapter.id)
    ? {...book,chapters:[...book.chapters,previewChapter].sort((a,b)=>a.order-b.order)} : book;
  const savedReview=review ? resolveSavedReview(book,review) : null;
  const followTarget = followedChapterSelection(followGeneration, live, book.novel.id);
  const [selection, setSelection] = useState<Selection | null>(()=>followTarget);
  const selected = resolveSelection(selection, displayBook);
  const reviewChapterId=savedReview?.execution?.id ?? savedReview?.chapters?.[0]?.id;
  const directorySelected:Selection=savedReview?.plan ? {kind:"plan",id:savedReview.plan.id}
    : reviewChapterId ? {kind:"chapter",id:reviewChapterId} : selected;
  const chapter = selected.kind === "chapter" ? displayBook.chapters.find(row => row.id === selected.id) : null;
  useEffect(() => {
    if (!followTarget) return;
    setSelection(followTarget);
    setReadingOrder(live?.chapterOrder ?? null);
    setCharacterId(null);
    if (savedReview) onLeaveReview?.();
    // A new execution (including a retry) focuses once, rather than on every token.
  }, [followTarget?.id, live?.executionId, Boolean(savedReview)]);
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
  const directory = <aside className={directoryOpen ? "flex h-full min-h-0 flex-col" : "shrink-0"}>
      <button onClick={()=>setDirectoryOpen(open=>!open)} aria-expanded={directoryOpen} className="mb-3 shrink-0 self-start px-3 py-2 text-xs text-muted-foreground hover:text-primary">{directoryOpen ? "收起本书目录" : "显示本书目录"}</button>
      {directoryOpen ? <ResourceDirectory book={displayBook} selected={directorySelected} onSelect={select} /> : null}
    </aside>;
  const content = savedReview ? <section key={review?.toString()} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none"><ReviewDetail book={book} review={savedReview}/></section> : <section data-chapter-scroll-viewport key={selected.kind + (selected.kind === "beat" ? selected.volumeId : "") + ("id" in selected ? selected.id : "")} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none">
      <PlanningDetail book={book} selected={selected} onSelect={select} />
      {chapter ? <ChapterReader key={chapter.id} chapter={chapter} chapters={displayBook.chapters} characters={book.materials.characters} onCharacter={openCharacter} onChapter={id => select({kind:"chapter",id})} generation={live?.chapterId===chapter.id ? live : null} followGeneration={followGeneration} />
        : selected.kind === "beat" || selected.kind === "plan" || (selected.kind === "volume" && book.planning) ? null : <AssetDetail book={book} selected={selected} onCharacter={openCharacter} />}
    </section>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {directoryOpen ? <ResizableWorkspace id="director-resource-layout" className="min-h-0 flex-1" label="调整目录与正文宽度" defaultLeft={27} minLeft={180} minRight={340} breakpoint={560} left={directory} right={content}/> : <>{directory}{content}</>}
    {character ? <CharacterDrawer key={character.id} book={book} character={character} readingOrder={chapter?.order ?? readingOrder} preview={preview} onClose={() => setCharacterId(null)} onChapter={id => select({kind:"chapter",id})} /> : null}
  </div>;
}
