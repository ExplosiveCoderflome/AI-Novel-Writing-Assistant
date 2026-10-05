import type { Selection, WorkspaceBook } from "./model";
import {WorldDetail,StoryDetail,CharacterDetail} from "./assets";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <section className="space-y-3 py-5"><h3 className="text-sm font-medium text-muted-foreground">{label}</h3><p className="whitespace-pre-wrap text-base leading-8">{value || "尚未填写"}</p></section>;
}

export function AssetDetail({ book, selected, onCharacter }: { book: WorkspaceBook; selected: Selection; onCharacter: (id: string) => void }) {
  const { materials } = book;
  const character = selected.kind === "character" ? materials.characters.find(row => row.id === selected.id) : null;
  const volume = selected.kind === "volume" ? materials.volumes.find(row => row.id === selected.id) : null;
  return <div className="mx-auto max-w-[42rem] px-2 pb-10 sm:px-6">
    <p className="mb-3 text-xs tracking-widest text-muted-foreground">本书资料</p>
    <h2 className="mb-5 text-2xl font-semibold">{character?.name ?? volume?.title ?? (selected.kind === "world" ? materials.world?.name ?? "世界设定" : "故事规划")}</h2>
    {selected.kind === "story" ? <StoryDetail materials={materials}/> : null}
    {selected.kind === "world" ? <WorldDetail world={materials.world}/> : null}
    {character ? <CharacterDetail character={character} onCharacter={onCharacter}/> : null}
    {volume ? <div className="divide-y divide-border/40"><Field label="本卷故事" value={volume.summary} /><Field label="本卷看点" value={volume.mainPromise} /><Field label="规划章节数" value={String(volume.chapterCount)} /></div> : null}
  </div>;
}
