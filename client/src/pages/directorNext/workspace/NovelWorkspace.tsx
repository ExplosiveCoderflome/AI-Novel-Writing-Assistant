import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import type {DirectorGenerationSnapshot, DirectorWorkspaceActivity} from "@ai-novel/shared/types/director/generation";
import {followedWorkspaceSelection} from "../generation";
import {sameSelection} from "./planning";
import type {WorkspaceChapter} from "./model";
import {useReadingDisplayPreferences} from "./reading";
import {LedgerView} from "./ledgers";
import {CastTimeline} from "./characters/CastTimeline";
const WorldMapView = lazy(()=>import("./visualizations").then(module=>({default:module.WorldMapView})));
const CharacterGraphView = lazy(()=>import("./visualizations").then(module=>({default:module.CharacterGraphView})));

export function NovelWorkspace({ book, preview = false, review, onLeaveReview, followGeneration = false, generation = null, activity }: { book: WorkspaceBook; preview?: boolean; review?:URLSearchParams; onLeaveReview?:()=>void; followGeneration?:boolean; generation?:DirectorGenerationSnapshot|null; activity?:DirectorWorkspaceActivity }) {
  const {preferences: readingDisplay, updatePreferences: onReadingDisplayChange} = useReadingDisplayPreferences();
  const live = followGeneration && generation?.novelId === book.novel.id ? generation : null;
  // Planning/polling may not yet include the newly created chapter. The preview is read-only.
  const previewChapter: WorkspaceChapter | null = live ? {id:live.chapterId,order:live.chapterOrder,title:live.chapterTitle,
    content:null,wordCount:0,status:"generating",updatedAt:"",qualityDebt:null} : null;
  const displayBook = previewChapter && !book.chapters.some(row=>row.id===previewChapter.id)
    ? {...book,chapters:[...book.chapters,previewChapter].sort((a,b)=>a.order-b.order)} : book;
  const savedReview=review ? resolveSavedReview(book,review) : null;
  const followTarget = followedWorkspaceSelection(followGeneration, activity, live, displayBook);
  const followKey = followTarget ? `${followTarget.key}:${JSON.stringify(followTarget.selection)}` : null;
  const [selection, setSelection] = useState<Selection | null>(()=>followTarget?.selection ?? null);
  const selected = resolveSelection(selection, displayBook);
  const reviewChapterId=savedReview?.execution?.id ?? savedReview?.chapters?.[0]?.id;
  const directorySelected:Selection=savedReview?.plan ? {kind:"plan",id:savedReview.plan.id}
    : reviewChapterId ? {kind:"chapter",id:reviewChapterId} : selected;
  const chapter = selected.kind === "chapter" ? displayBook.chapters.find(row => row.id === selected.id) : null;
  const contentViewport = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!followTarget) return;
    setSelection(followTarget.selection);
    setReadingOrder(followTarget.selection.kind === "chapter" ? live?.chapterOrder ?? null : null);
    setCharacterId(null);
    if (followTarget.selection.kind !== "chapter" && contentViewport.current) contentViewport.current.scrollTop = 0;
    if (savedReview) onLeaveReview?.();
    // Focus once per stage/execution or when the target becomes available; never on every token/poll.
  }, [followKey]);
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
  const content = savedReview ? <section key={review?.toString()} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none"><ReviewDetail book={book} review={savedReview} readingDisplay={readingDisplay} onReadingDisplayChange={onReadingDisplayChange}/></section> : <section ref={contentViewport} data-chapter-scroll-viewport key={selected.kind + (selected.kind === "beat" ? selected.volumeId : "") + ("id" in selected ? selected.id : "")} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none">
      {followTarget && sameSelection(selected, followTarget.selection) && selected.kind !== "chapter" && activity?.focus ? <p role="status" className="mx-auto mb-4 max-w-[42rem] px-2 text-xs leading-6 text-muted-foreground sm:px-6">正在查看「{activity.focus.label}」；生成的资料保存后会自动显示。</p> : null}
      <PlanningDetail book={book} selected={selected} onSelect={select} />
      {selected.kind === "world_map" ? <Suspense fallback={<p className="px-6 text-sm text-muted-foreground">正在读取世界地图…</p>}><WorldMapView book={book} onOpenWorld={()=>select({kind:"world"})}/></Suspense>
        : selected.kind === "character_graph" ? <Suspense fallback={<p className="px-6 text-sm text-muted-foreground">正在读取角色关系图…</p>}><CharacterGraphView book={book} preview={preview} onOpenCharacter={id=>select({kind:"character",id})}/></Suspense>
        : selected.kind === "character_timeline" ? <CastTimeline book={book} onSelect={select} preview={preview}/>
        : selected.kind === "foreshadowing" || selected.kind === "resources" || selected.kind === "character_resources" ? <LedgerView book={book} selection={selected} onSelect={select} preview={preview}/>
        : chapter ? <ChapterReader key={chapter.id} chapter={chapter} chapters={displayBook.chapters} characters={book.materials.characters} onCharacter={openCharacter} onChapter={id => select({kind:"chapter",id})} generation={live?.chapterId===chapter.id ? live : null} followGeneration={followGeneration} readingDisplay={readingDisplay} onReadingDisplayChange={onReadingDisplayChange}/>
        : selected.kind === "beat" || selected.kind === "plan" || (selected.kind === "volume" && book.planning) ? null : <AssetDetail book={book} selected={selected} onCharacter={openCharacter} onSelect={select} preview={preview} />}
    </section>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {directoryOpen ? <ResizableWorkspace id="director-resource-layout" className="min-h-0 flex-1" label="调整目录与正文宽度" defaultLeft={27} minLeft={180} minRight={340} breakpoint={560} left={directory} right={content}/> : <>{directory}{content}</>}
    {character ? <CharacterDrawer key={character.id} book={book} character={character} readingOrder={chapter?.order ?? readingOrder} preview={preview} onClose={() => setCharacterId(null)} onChapter={id => select({kind:"chapter",id})} onPlan={id => select({kind:"plan",id})} onResources={id=>{setCharacterId(null);select({kind:"character_resources",id});}}/> : null}
  </div>;
}
