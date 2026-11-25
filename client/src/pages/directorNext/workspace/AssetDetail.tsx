import {VolumeSummaryText} from "./reading/VolumeSummaryEmphasis";
import type { Selection, WorkspaceBook } from "./model";
import {WorldDetail,StoryDetail,CharacterDetail,CastOverview,PlanningOverview} from "./assets";
import {CharacterAppearances} from "./characters/CharacterAppearances";
import {SavedFields} from "./assets/sections";

export function AssetDetail({ book, selected, onCharacter, onEditCharacter, onSelect, preview=false }: {
  book: WorkspaceBook; selected: Selection; onCharacter: (id: string) => void; onEditCharacter?: (id: string) => void;
  onSelect?: (selection:Selection)=>void; preview?:boolean;
}) {
  const { materials } = book;
  const character = selected.kind === "character" ? materials.characters.find(row => row.id === selected.id) : null;
  const volume = selected.kind === "volume" ? materials.volumes.find(row => row.id === selected.id) : null;
  return <div className="min-w-0 px-2 pb-10 [container-type:inline-size] sm:px-6">
    <h2 className="mb-3 break-words text-2xl font-bold">{character?.name ?? volume?.title ?? (selected.kind === "world" ? materials.world?.name ?? "世界设定" : selected.kind === "characters" ? "角色阵容" : selected.kind === "volumes" ? "分卷与章节规划" : "故事规划")}</h2>
    {selected.kind === "story" ? <StoryDetail materials={materials}/> : null}
    {selected.kind === "world" ? <WorldDetail world={materials.world}/> : null}
    {selected.kind === "characters" ? <CastOverview book={book} onSelect={onSelect}/> : null}
    {selected.kind === "volumes" ? <PlanningOverview book={book} onSelect={onSelect}/> : null}
    {character ? <CharacterDetail character={character} onCharacter={onCharacter} onEditCharacter={preview ? undefined : onEditCharacter}
      onResources={onSelect ? id=>onSelect({kind:"character_resources",id}) : undefined} canAdjust={!preview}/> : null}
    {character && onSelect ? <CharacterAppearances novelId={book.novel.id} characterId={character.id} boundary="latest" preview={preview} planning={book.planning} notices={book.characterForwardPlanNotices} onSelect={onSelect}/> : null}
    {volume ? <SavedFields lead fields={[["本卷故事",volume.summary,<VolumeSummaryText id={volume.id} text={volume.summary}/>],["本卷看点",volume.mainPromise],["规划章节数",String(volume.chapterCount)]]}/> : null}
  </div>;
}
