import { BookOpen, Globe2, Users, Layers, FileText } from "lucide-react";
import type { ReactNode } from "react";
import type { Selection, WorkspaceBook } from "./model";

const chapterLabels = {
  waiting_planning: "待规划", waiting_writing: "待写作", generating: "写作中", reviewing: "检查中",
  quality_debt: "待完善", replan_required: "待调整", completed: "可阅读", error: "待处理",
};

export function ResourceDirectory({ book, selected, onSelect }: { book: WorkspaceBook; selected: Selection; onSelect: (item: Selection) => void }) {
  function row(item: Selection, label: string, icon?: ReactNode, note?: string) {
    const active = selected.kind === item.kind && (!("id" in item) || ("id" in selected && selected.id === item.id));
    return <button type="button" key={"id" in item ? item.id : item.kind} aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80"}`}
      onClick={() => onSelect(item)}>
      {icon}<span className="min-w-0 flex-1 truncate">{label}</span>{note ? <span className="shrink-0 text-[10px] text-muted-foreground">{note}</span> : null}
    </button>;
  }
  function group(label: string, icon: ReactNode, count: number, children: ReactNode) {
    return <details open className="mt-5"><summary className="mb-2 flex cursor-pointer items-center gap-2 px-3 text-xs font-medium text-muted-foreground">{icon}{label}<span className="ml-auto">{count}</span></summary>{children}{count === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">暂无{label}</p> : null}</details>;
  }
  return <nav aria-label="小说资源目录" className="max-h-[70vh] overflow-y-auto pb-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
    <p className="px-3 pb-3 text-xs font-medium tracking-widest text-muted-foreground">本书内容</p>
    {row({ kind: "story" }, "故事规划", <BookOpen className="h-4 w-4" />)}
    {row({ kind: "world" }, "世界设定", <Globe2 className="h-4 w-4" />)}
    {group("角色", <Users className="h-3.5 w-3.5" />, book.materials.characters.length, book.materials.characters.map(character => row({ kind: "character", id: character.id }, character.name)))}
    {group("卷纲", <Layers className="h-3.5 w-3.5" />, book.materials.volumes.length, book.materials.volumes.map(volume => row({ kind: "volume", id: volume.id }, volume.title)))}
    {group("章节", <FileText className="h-3.5 w-3.5" />, book.chapters.length, book.chapters.map(chapter => row({ kind: "chapter", id: chapter.id }, `${chapter.order}. ${chapter.title}`, undefined, chapterLabels[chapter.status])))}
  </nav>;
}
