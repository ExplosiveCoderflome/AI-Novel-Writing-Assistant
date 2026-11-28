import { ChevronRight } from "lucide-react";
import type { Selection, WorkspaceBook } from "../model";
import { beatChapterLabel } from "../planning";
import { AssetSection, SavedFields } from "./sections";
import { VolumeSummaryText } from "../reading/VolumeSummaryEmphasis";

export function PlanningOverview({book, onSelect}: {book: WorkspaceBook; onSelect?: (selection: Selection) => void}) {
  const strategy = book.planning?.strategyPlan;
  const volumes = book.planning
    ? book.planning.volumes.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(volume => ({
        ...volume, range: beatChapterLabel(volume.chapters.map(plan => ({ plan }))),
      }))
    : book.materials.volumes.slice().sort((a, b) => a.order - b.order).map(volume => ({
        ...volume, range: volume.chapterCount ? `${volume.chapterCount} 章` : "待拆章",
      }));
  return <div>
    {strategy ? <AssetSection title="全书推进思路" open={!volumes.length}>
      <SavedFields fields={[["读者收获怎样推进",strategy.readerRewardLadder],["冲突如何升级",strategy.escalationLadder],
        ["中段变化",strategy.midpointShift],["规划说明",strategy.notes]]}/>
    </AssetSection> : null}
    {volumes.length ? <ol aria-label="各卷故事" className="divide-y divide-border/60 border-y border-border/60">
      {volumes.map((volume, index) => <li key={volume.id} className="py-4">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-xs leading-5 text-muted-foreground">
          <span>第 {index + 1} 卷</span><span>{volume.range}</span>
        </div>
        <h3 className="text-xl font-semibold leading-snug">
          {onSelect ? <button type="button" className="inline-flex max-w-full items-center gap-1 rounded-sm text-left hover:underline focus-visible:underline"
            aria-label={`查看卷纲：${volume.title}`} onClick={() => onSelect({kind:"volume",id:volume.id})}>
            <span className="min-w-0 break-words">{volume.title}</span><ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground"/>
          </button> : volume.title}
        </h3>
        {volume.summary?.trim() ? <p className="mt-2 max-w-[48em] whitespace-pre-wrap break-words text-base leading-7"><VolumeSummaryText id={volume.id} text={volume.summary}/></p> : null}
        {volume.mainPromise?.trim() ? <details className="mt-2" open={!volume.summary?.trim()}>
          <summary className="w-fit cursor-pointer rounded-sm py-1 text-sm font-medium text-muted-foreground hover:text-foreground">读者期待</summary>
          <p className="mt-1 max-w-[48em] whitespace-pre-wrap break-words text-sm leading-7">{volume.mainPromise}</p>
        </details> : null}
      </li>)}
    </ol> : <p className="py-5 text-sm text-muted-foreground">分卷规划保存后，可查看每卷的故事、节奏段和章节安排。</p>}
  </div>;
}
