import { BookOpen, Globe2, Users, Layers, FileText, Map, Network } from "lucide-react";
import type { ReactNode } from "react";
import type { Selection, WorkspaceBook } from "./model";
import { buildStoryDirectory, beatSelection, chapterSelection, sameSelection } from "./planning";
import type { PlannedChapter } from "./planning";

const chapterLabels = {
  waiting_planning: "待规划", waiting_writing: "待写作", generating: "写作中", reviewing: "检查中",
  quality_debt: "待完善", replan_required: "待调整", completed: "可阅读", error: "待处理",
};

export function ResourceDirectory({ book, selected, onSelect }: { book: WorkspaceBook; selected: Selection; onSelect: (item: Selection) => void }) {
  const tree = buildStoryDirectory(book, book.planning);
  function row(item: Selection, label: string, icon?: ReactNode, note?: string) {
    const active = sameSelection(selected, item);
    return <button type="button" key={"id" in item ? item.id : item.kind} aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80"}`}
      onClick={() => onSelect(item)}>
      {icon}<span className="min-w-0 flex-1 truncate">{label}</span>{note ? <span className="shrink-0 text-[10px] text-muted-foreground">{note}</span> : null}
    </button>;
  }
  function chapterRow(item: PlannedChapter) {
    return row(chapterSelection(item), `${item.chapter?.order ?? item.plan?.chapterOrder}. ${item.chapter?.title ?? item.plan?.title}`, undefined,
      item.chapter ? chapterLabels[item.chapter.status] : "待写正文");
  }
  function contains(rows: PlannedChapter[]) { return rows.some(item => sameSelection(chapterSelection(item), selected)); }
  function group(label: string, icon: ReactNode, count: number, children: ReactNode) {
    return <details open className="mt-5"><summary className="mb-2 flex cursor-pointer items-center gap-2 px-3 text-xs font-medium text-muted-foreground">{icon}{label}<span className="ml-auto">{count}</span></summary>{children}{count === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">暂无{label}</p> : null}</details>;
  }
  return <nav aria-label="小说资源目录" className="max-h-[70dvh] min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 md:max-h-none">
    <p className="px-3 pb-3 text-xs font-medium tracking-widest text-muted-foreground">故事目录</p>
    {tree.volumes.map(({volume,beats,chapters,unassigned}) => <details key={volume.id} open={contains(chapters) || (selected.kind === "volume" && selected.id === volume.id) || (selected.kind === "beat" && selected.volumeId === volume.id)} className="mb-3">
      <summary className="cursor-pointer px-2 py-2 text-sm font-medium">{volume.title}</summary>
      <div className="ml-2">
        {row({kind:"volume",id:volume.id}, "查看卷纲", <Layers className="h-3.5 w-3.5" />)}
        {beats.map(({beat,chapters:beatChapters}) => <details key={beat.key} open={contains(beatChapters) || sameSelection(selected,beatSelection(volume.id,beat))}>
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">{beat.title || beat.label}</summary>
          <div className="ml-3">{row(beatSelection(volume.id,beat),"查看节奏段目标")}{beatChapters.map(chapterRow)}{beatChapters.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">暂无章节规划</p> : null}</div>
        </details>)}
        {beats.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">节奏段待规划</p> : null}
        {unassigned.length ? <div><p className="px-3 py-2 text-xs text-muted-foreground">待归类章节</p>{unassigned.map(chapterRow)}</div> : null}
      </div>
    </details>)}
    {tree.unassigned.length ? group(book.planning ? "待归类章节" : "章节", <FileText className="h-3.5 w-3.5" />, tree.unassigned.length, tree.unassigned.map(chapterRow)) : null}
    {!book.planning ? group("卷纲", <Layers className="h-3.5 w-3.5" />, book.materials.volumes.length, book.materials.volumes.map(volume => row({kind:"volume",id:volume.id},volume.title))) : null}
    <p className="mt-6 px-3 pb-3 text-xs font-medium tracking-widest text-muted-foreground">小说资产</p>
    {row({ kind: "story" }, "故事规划", <BookOpen className="h-4 w-4" />)}
    {row({ kind: "world" }, "世界设定", <Globe2 className="h-4 w-4" />)}
    {row({ kind: "world_map" }, "世界地图", <Map className="h-4 w-4" />)}
    {row({ kind: "character_graph" }, "角色关系图", <Network className="h-4 w-4" />)}
    {group("角色", <Users className="h-3.5 w-3.5" />, book.materials.characters.length, book.materials.characters.map(character => row({ kind: "character", id: character.id }, character.name)))}
  </nav>;
}
