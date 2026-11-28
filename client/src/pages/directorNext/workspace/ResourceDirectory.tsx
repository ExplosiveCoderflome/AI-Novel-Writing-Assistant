import {
  BookMarked, BookOpen, CalendarDays, FileText, Globe2, Layers, ListChecks,
  Lock, Map, Network, Package, Route, Users, type LucideIcon,
} from "lucide-react";
import type { Selection, WorkspaceBook } from "./model";
import { buildStoryDirectory, beatSelection, chapterSelection, sameSelection, beatChapterLabel, type PlannedChapter } from "./planning";
import { CharacterDirectoryItem } from "./characters/CharacterDirectoryItem";
import { DirectoryBranch } from "./directory/DirectoryBranch";
import { resolveWorkspaceChapterProvenance } from "./chapterProvenance";
import "./directory/directory.css";

const chapterLabels = {
  waiting_planning: "待规划", waiting_writing: "待写作", generating: "写作中", reviewing: "检查中",
  quality_debt: "待完善", replan_required: "待调整", completed: "可阅读", error: "待处理",
};

const entryStyle = "w-full min-w-0 rounded-md px-2 py-2 text-left hover:bg-muted/65 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=true]:bg-primary/10 aria-[current=true]:font-semibold aria-[current=true]:text-primary";
const childrenStyle = "mb-2 ml-3 border-l border-border/70 pl-2";

export function ResourceDirectory({ book, selected, onSelect }: { book: WorkspaceBook; selected: Selection; onSelect: (item: Selection) => void }) {
  const tree = buildStoryDirectory(book, book.planning);
  const plansToReview = new Set(book.characterForwardPlanNotices?.map(notice => notice.planId));
  const selectionKey = "id" in selected ? `${selected.kind}:${selected.id}` : selected.kind;
  const characters = book.materials.characters;
  const inCast = ["characters", "character", "character_graph", "character_timeline"].includes(selected.kind);
  const inLedgers = ["foreshadowing", "resources", "character_resources"].includes(selected.kind);
  const inWorld = ["story", "world", "world_map"].includes(selected.kind);

  function row(item: Selection, label: string, Icon: LucideIcon) {
    const active = sameSelection(selected, item) || (item.kind === "resources" && selected.kind === "character_resources");
    return <button type="button" key={"id" in item ? item.id : item.kind} aria-current={active || undefined}
      className={`${entryStyle} flex items-center gap-2.5 text-sm`} onClick={() => onSelect(item)}>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-words">{label}</span>
    </button>;
  }
  function chapterRow(item: PlannedChapter) {
    const target = chapterSelection(item);
    const order = item.chapter?.order ?? item.plan?.chapterOrder;
    const title = item.chapter?.title ?? item.plan?.title;
    const status = item.plan && plansToReview.has(item.plan.id) ? "待核对" : item.chapter ? chapterLabels[item.chapter.status] : "待写正文";
    const provenance = item.chapter ? resolveWorkspaceChapterProvenance(item.chapter) : null;
    const stateText = provenance === "human_locked"
      ? (item.chapter?.status === "completed" ? "已锁定" : `${status} · 已锁定`)
      : provenance === "human_edited"
        ? (item.chapter?.status === "completed" ? "人工修订" : `${status} · 人工修订`)
        : status;
    return <button type="button" key={item.plan?.id ?? item.chapter?.id} aria-current={sameSelection(selected, target) || undefined}
      aria-label={`第 ${order} 章 · ${title}，${stateText}`} onClick={() => onSelect(target)}
      className={`${entryStyle} chapter-entry gap-x-2 gap-y-0.5 text-sm`}>
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">第 {order} 章</span>
      <span className="min-w-0 break-words">{title}</span>
      <span className={`chapter-state inline-flex items-center gap-1 text-xs font-normal ${provenance === "human_locked" ? "text-primary/90" : "text-muted-foreground"}`}>
        {provenance === "human_locked" ? <Lock aria-hidden="true" className="size-3 shrink-0" /> : null}
        {stateText}
      </span>
    </button>;
  }
  function contains(rows: PlannedChapter[]) {
    return rows.some(item => sameSelection(chapterSelection(item), selected));
  }
  function groupHeading(label: string, Icon: LucideIcon, count?: string) {
    return <><Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      {count && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
    </>;
  }

  return <nav aria-label="小说资源目录" className="director-directory max-h-[70dvh] min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4 md:max-h-none">
    <section aria-label="故事目录">
      {row({kind: "volumes"}, "分卷与章节规划", Layers)}
      <div className="mt-2 space-y-1">
        {tree.volumes.map(({ volume, beats, chapters, unassigned }) => {
          const active = contains(chapters) || sameSelection(selected, {kind: "volume", id: volume.id})
            || (selected.kind === "beat" && selected.volumeId === volume.id);
          return <DirectoryBranch key={volume.id} reveal={active ? selectionKey : undefined} heading={<>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">卷 {volume.sortOrder}</span>
            <span className="min-w-0 flex-1 break-words text-base font-semibold leading-snug">{volume.title}</span>
          </>}>
            <div className={childrenStyle}>
              {row({kind: "volume", id: volume.id}, "查看卷纲", BookMarked)}
              {unassigned.map(chapterRow)}
              {beats.map(({ beat, chapters: beatChapters }) => {
                const target = beatSelection(volume.id, beat);
                const activeBeat = contains(beatChapters) || sameSelection(selected, target);
                const chapterRange = beatChapterLabel(beatChapters);
                return <DirectoryBranch key={beat.key} reveal={activeBeat ? selectionKey : undefined} heading={
                  <span className="beat-label grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5">
                    <span className="min-w-0 break-words text-sm font-medium">{beat.title || beat.label}</span>
                    <span className="max-w-24 truncate text-xs tabular-nums text-muted-foreground" title={chapterRange}>{chapterRange}</span>
                  </span>
                }>
                  <div className={childrenStyle}>
                    {row(target, "查看节奏段目标", Route)}
                    {beatChapters.map(chapterRow)}
                    {!beatChapters.length && <p className="px-2 py-2 text-xs text-muted-foreground">暂无章节规划</p>}
                  </div>
                </DirectoryBranch>;
              })}
              {!beats.length && <p className="px-2 py-2 text-xs text-muted-foreground">节奏段待规划</p>}
            </div>
          </DirectoryBranch>;
        })}
        {tree.unassigned.length > 0 && <DirectoryBranch heading={groupHeading(book.planning ? "未归卷章节" : "章节", FileText, `${tree.unassigned.length} 章`)}
          reveal={contains(tree.unassigned) ? selectionKey : undefined}>
          <div className={childrenStyle}>{tree.unassigned.map(chapterRow)}</div>
        </DirectoryBranch>}
        {!book.planning && <DirectoryBranch heading={groupHeading("卷纲", Layers)} reveal={selected.kind === "volume" ? selectionKey : undefined}>
          <div className={childrenStyle}>
            {book.materials.volumes.map(volume => row({kind: "volume", id: volume.id}, volume.title, BookMarked))}
            {!book.materials.volumes.length && <p className="px-2 py-2 text-xs text-muted-foreground">暂无卷纲</p>}
          </div>
        </DirectoryBranch>}
      </div>
    </section>

    <section aria-label="本书资料" className="mt-5 space-y-1 border-t border-border/70 pt-3">
      <DirectoryBranch heading={groupHeading("故事与世界", Globe2)} reveal={inWorld ? selectionKey : undefined}>
        <div className={childrenStyle}>
          {row({kind: "story"}, "故事规划", BookOpen)}
          {row({kind: "world"}, "世界设定", Globe2)}
          {row({kind: "world_map"}, "世界地图", Map)}
        </div>
      </DirectoryBranch>
      <DirectoryBranch heading={groupHeading("伏笔与背包", Package)} reveal={inLedgers ? selectionKey : undefined}>
        <div className={childrenStyle}>
          {row({kind: "foreshadowing"}, "伏笔", ListChecks)}
          {row({kind: "resources"}, "背包与资源", Package)}
        </div>
      </DirectoryBranch>
      <DirectoryBranch heading={groupHeading("角色资料", Users, `${characters.length} 人`)} reveal={inCast ? selectionKey : undefined}>
        <div className={childrenStyle}>
          {row({kind: "characters"}, "角色阵容", Users)}
          {row({kind: "character_graph"}, "角色关系图", Network)}
          {row({kind: "character_timeline"}, "角色时间线", CalendarDays)}
          {characters.length ? <div className="mt-2 border-t border-border/60 pt-2">
            {characters.map(character => <CharacterDirectoryItem key={character.id} character={character}
              active={selected.kind === "character" && selected.id === character.id}
              onSelect={() => onSelect({kind: "character", id: character.id})} />)}
          </div> : <p className="px-2 py-2 text-xs text-muted-foreground">暂无角色</p>}
        </div>
      </DirectoryBranch>
    </section>
  </nav>;
}
