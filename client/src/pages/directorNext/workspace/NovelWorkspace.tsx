import { useState } from "react";
import { ResourceDirectory } from "./ResourceDirectory";
import { ChapterReader } from "./ChapterReader";
import { AssetDetail } from "./AssetDetail";
import { CharacterDrawer } from "./CharacterDrawer";
import { PlanningDetail } from "./PlanningDetail";
import { resolveSelection } from "./model";
import type { Selection, WorkspaceBook } from "./model";

export function NovelWorkspace({ book, preview = false }: { book: WorkspaceBook; preview?: boolean }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const selected = resolveSelection(selection, book);
  const chapter = selected.kind === "chapter" ? book.chapters.find(row => row.id === selected.id) : null;
  const [readingOrder, setReadingOrder] = useState<number | null>(() => chapter?.order ?? null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const character = book.materials.characters.find(row => row.id === characterId);
  function select(item: Selection) {
    if (chapter) setReadingOrder(chapter.order);
    setSelection(item);
    if (item.kind === "chapter") setReadingOrder(book.chapters.find(row => row.id === item.id)?.order ?? null);
  }
  function openCharacter(id: string) {
    if (chapter) setReadingOrder(chapter.order);
    setCharacterId(id);
  }
  return <div className={`grid min-w-0 gap-6 ${directoryOpen ? "md:grid-cols-[240px_minmax(0,1fr)]" : "grid-cols-1"}`}>
    <aside className={directoryOpen ? "md:border-r md:border-border/50 md:pr-4" : ""}>
      <button onClick={()=>setDirectoryOpen(open=>!open)} aria-expanded={directoryOpen} className="mb-3 px-3 py-2 text-xs text-muted-foreground hover:text-primary">{directoryOpen ? "收起本书目录" : "显示本书目录"}</button>
      {directoryOpen ? <ResourceDirectory book={book} selected={selected} onSelect={select} /> : null}
    </aside>
    <section key={selected.kind + (selected.kind === "beat" ? selected.volumeId : "") + ("id" in selected ? selected.id : "")} className="max-h-[75dvh] min-w-0 overflow-y-auto pb-6">
      <PlanningDetail book={book} selected={selected} onSelect={select} />
      {chapter ? <ChapterReader key={chapter.id} chapter={chapter} chapters={book.chapters} characters={book.materials.characters} onCharacter={openCharacter} onChapter={id => select({kind:"chapter",id})} />
        : selected.kind === "beat" || selected.kind === "plan" || (selected.kind === "volume" && book.planning) ? null : <AssetDetail book={book} selected={selected} onCharacter={openCharacter} />}
    </section>
    {character ? <CharacterDrawer key={character.id} book={book} character={character} readingOrder={chapter?.order ?? readingOrder} preview={preview} onClose={() => setCharacterId(null)} onChapter={id => select({kind:"chapter",id})} /> : null}
  </div>;
}
