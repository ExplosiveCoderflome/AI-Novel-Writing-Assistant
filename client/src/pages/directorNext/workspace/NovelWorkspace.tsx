import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
import {VolumeEmphasisProvider} from "./reading/VolumeSummaryEmphasis";
import {LedgerView} from "./ledgers";
import {CastTimeline} from "./characters/CastTimeline";
import { CharacterForwardAdjustDialog } from "./characters/CharacterForwardAdjustDialog";
import type { CharacterForwardPreview } from "@ai-novel/shared/types/characterForwardAdjustment";
const WorldMapView = lazy(()=>import("./visualizations").then(module=>({default:module.WorldMapView})));
const CharacterGraphView = lazy(()=>import("./visualizations").then(module=>({default:module.CharacterGraphView})));

export function NovelWorkspace({ book, preview = false, review, onLeaveReview, onOpenChapterReview, followGeneration = false, generation = null, activity, onEditChapter, editedChapter, onAdjustingCharacter }: { book: WorkspaceBook; preview?: boolean; review?:URLSearchParams; onLeaveReview?:()=>void; onOpenChapterReview?:()=>void; followGeneration?:boolean; generation?:DirectorGenerationSnapshot|null; activity?:DirectorWorkspaceActivity; onEditChapter?:(chapterId:string)=>void; editedChapter?:{id:string;revision:number}|null; onAdjustingCharacter?:(active:boolean)=>void }) {
  const {preferences: readingDisplay, updatePreferences: onReadingDisplayChange} = useReadingDisplayPreferences();
  const [characterAdjustment, setCharacterAdjustment] = useState<CharacterForwardPreview | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [characterId, setCharacterId] = useState<string | null>(null);
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
  const reviewChapterId=savedReview?.executions?.[0]?.id ?? savedReview?.chapters?.[0]?.id;
  const directorySelected:Selection=savedReview?.plan ? {kind:"plan",id:savedReview.plan.id}
    : reviewChapterId ? {kind:"chapter",id:reviewChapterId} : selected;
  const chapter = selected.kind === "chapter" ? displayBook.chapters.find(row => row.id === selected.id) : null;
  const editChapter = !preview && onEditChapter ? onEditChapter : undefined;
  const canEditChapter = chapter && book.chapters.some(row=>row.id===chapter.id);
  const contentViewport = useRef<HTMLElement | null>(null);
  const handledFollowKey = useRef<string | null>(null);
  useEffect(() => {
    if (!followGeneration) {
      handledFollowKey.current = null;
      return;
    }
    if (!followTarget || !followKey || handledFollowKey.current === followKey) return;
    // Keep the selected character in view. A focus seen while the drawer is open has already been handled.
    handledFollowKey.current = followKey;
    if (characterId) return;
    setSelection(followTarget.selection);
    setReadingOrder(followTarget.selection.kind === "chapter" ? live?.chapterOrder ?? null : null);
    if (followTarget.selection.kind !== "chapter" && contentViewport.current) contentViewport.current.scrollTop = 0;
    if (savedReview) onLeaveReview?.();
    // Focus once per stage/execution or when the target becomes available; never on every token/poll.
  }, [followKey, followGeneration, characterId]);
  const [readingOrder, setReadingOrder] = useState<number | null>(() => chapter?.order ?? null);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const character = book.materials.characters.find(row => row.id === characterId);
  function setAdjustment(value: CharacterForwardPreview | null) {
    setCharacterAdjustment(value);
    onAdjustingCharacter?.(value !== null);
  }
  function setProfileEditing(editing: boolean) {
    setEditingProfile(editing);
    onAdjustingCharacter?.(editing);
  }
  function select(item: Selection) {
    if (savedReview) onLeaveReview?.();
    if (chapter) setReadingOrder(chapter.order);
    setSelection(item);
    if (item.kind === "chapter") setReadingOrder(book.chapters.find(row => row.id === item.id)?.order ?? null);
  }
  function openCharacter(id: string, editProfile = false) {
    if (chapter) setReadingOrder(chapter.order);
    setCharacterId(id);
    setProfileEditing(editProfile);
  }
  const directory = <aside className={directoryOpen ? "flex h-full min-h-0 flex-col" : "shrink-0"}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-2">
        {directoryOpen && <h2 className="text-lg font-semibold tracking-tight">本书目录</h2>}
        <button type="button" onClick={()=>setDirectoryOpen(open=>!open)} aria-expanded={directoryOpen}
          aria-label={directoryOpen ? "收起本书目录" : "显示本书目录"} title={directoryOpen ? "收起本书目录" : "显示本书目录"}
          className="inline-flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {directoryOpen ? <PanelLeftClose aria-hidden="true" className="size-4"/> : <><PanelLeftOpen aria-hidden="true" className="size-4"/>显示本书目录</>}
        </button>
      </div>
      {directoryOpen ? <ResourceDirectory book={displayBook} selected={directorySelected} onSelect={select} /> : null}
    </aside>;
  const content = savedReview ? <section key={review?.toString()} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none"><ReviewDetail book={book} review={savedReview} readingDisplay={readingDisplay} onReadingDisplayChange={onReadingDisplayChange} onOpenChapter={onLeaveReview ? id=>select({kind:"chapter",id}) : undefined} onEditChapter={editChapter}/></section> : <section ref={contentViewport} data-chapter-scroll-viewport key={selected.kind + (selected.kind === "beat" ? selected.volumeId : "") + ("id" in selected ? selected.id : "")} className="h-full max-h-[75dvh] min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 md:max-h-none">
      {followTarget && sameSelection(selected, followTarget.selection) && selected.kind !== "chapter" && activity?.focus ? <p role="status" className="mb-4 px-2 text-xs leading-6 text-muted-foreground sm:px-6">正在查看「{activity.focus.label}」；生成的资料保存后会自动显示。</p> : null}
      <PlanningDetail book={book} selected={selected} onSelect={select} onOpenChapterReview={onOpenChapterReview} />
      {selected.kind === "world_map" ? <Suspense fallback={<p className="px-6 text-sm text-muted-foreground">正在读取世界地图…</p>}><WorldMapView book={book} onOpenWorld={()=>select({kind:"world"})}/></Suspense>
        : selected.kind === "character_graph" ? <Suspense fallback={<p className="px-6 text-sm text-muted-foreground">正在读取角色关系图…</p>}><CharacterGraphView book={book} preview={preview} onOpenCharacter={id=>select({kind:"character",id})}/></Suspense>
        : selected.kind === "character_timeline" ? <CastTimeline book={book} onSelect={select} preview={preview}/>
        : selected.kind === "foreshadowing" || selected.kind === "resources" || selected.kind === "character_resources" ? <LedgerView book={book} selection={selected} onSelect={select} preview={preview}/>
        : chapter ? <ChapterReader key={`${chapter.id}:${editedChapter?.id===chapter.id ? editedChapter.revision : 0}`} chapter={chapter} chapters={displayBook.chapters} characters={book.materials.characters} onCharacter={openCharacter} onChapter={id => select({kind:"chapter",id})} generation={live?.chapterId===chapter.id ? live : null} followGeneration={followGeneration} readingDisplay={readingDisplay} onReadingDisplayChange={onReadingDisplayChange} onEdit={canEditChapter ? editChapter : undefined}/>
        : selected.kind === "beat" || selected.kind === "plan" || (selected.kind === "volume" && book.planning) ? null : <AssetDetail book={book} selected={selected} onCharacter={openCharacter}
          onEditCharacter={id => openCharacter(id, true)} onSelect={select} preview={preview} />}
    </section>;
  const showVolumeSummary = savedReview ? savedReview.type === "volume_strategy" : selected.kind === "volumes" || selected.kind === "volume";
  const readingPane = showVolumeSummary && !preview ? <VolumeEmphasisProvider book={book}>{content}</VolumeEmphasisProvider> : content;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {directoryOpen ? <ResizableWorkspace id="director-resource-layout" className="min-h-0 flex-1" label="调整目录与正文宽度" defaultLeft={20} minLeft={180} minRight={340} breakpoint={560} left={directory} right={readingPane}/> : <>{directory}{readingPane}</>}
    {character ? <CharacterDrawer key={character.id} book={book} character={character} readingOrder={chapter?.order ?? readingOrder} preview={preview} onClose={() => {if (!characterAdjustment) setCharacterId(null);}} onChapter={id => select({kind:"chapter",id})} onPlan={id => select({kind:"plan",id})} onResources={id=>{setCharacterId(null);select({kind:"character_resources",id});}} onAdjust={preview ? undefined : setAdjustment}
      editingProfile={editingProfile} onProfileEditingChange={setProfileEditing}/> : null}
    {character && characterAdjustment ? <CharacterForwardAdjustDialog novelId={book.novel.id} character={character} initialPreview={characterAdjustment} onClose={() => setAdjustment(null)}/> : null}
  </div>;
}
