import { Button } from "@/components/ui/button";
import type { Selection, WorkspaceBook } from "./model";

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
    <div className="divide-y divide-border/40">
      {selected.kind === "story" ? <><Field label="故事简介" value={materials.description} /><Field label="核心看点" value={materials.story.coreSellingPoint} /><Field label="读者期待" value={materials.story.readingPromise} /><Field label="开篇方向" value={materials.story.first30ChapterPromise} /><Field label="主角带来的体验" value={materials.story.protagonistFantasy} /></> : null}
      {selected.kind === "world" ? <Field label="世界概况" value={materials.world?.summary} /> : null}
      {character ? <><Field label="角色身份" value={character.role} /><Field label="性格设定" value={character.personality} /><Field label="故事作用" value={character.storyFunction} /><div className="py-5"><Button onClick={() => onCharacter(character.id)}>查看变化记录</Button><p className="mt-3 text-xs leading-6 text-muted-foreground">按阅读章节查看记录；最新行动目标可在角色面板中切换查看。</p></div></> : null}
      {volume ? <><Field label="本卷故事" value={volume.summary} /><Field label="本卷看点" value={volume.mainPromise} /><Field label="规划章节数" value={String(volume.chapterCount)} /></> : null}
    </div>
  </div>;
}
