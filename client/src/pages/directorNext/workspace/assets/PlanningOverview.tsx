import type { Selection, WorkspaceBook } from "../model";
import { SavedFields } from "./sections";

export function PlanningOverview({book, onSelect}: {book: WorkspaceBook; onSelect?: (selection: Selection) => void}) {
  const strategy = book.planning?.strategyPlan;
  const volumes = book.planning?.volumes ?? book.materials.volumes;
  return <div className="divide-y divide-border/40">
    {strategy ? <section className="py-5"><SavedFields fields={[["读者收获怎样推进",strategy.readerRewardLadder],
      ["冲突如何升级",strategy.escalationLadder],["中段变化",strategy.midpointShift],["规划说明",strategy.notes]]}/></section> : null}
    {volumes.map(volume => <section key={volume.id} className="py-5">
      <button className="text-lg font-medium hover:text-primary" onClick={() => onSelect?.({kind:"volume",id:volume.id})}>{volume.title}</button>
      <SavedFields fields={[["本卷故事",volume.summary],["读者期待",volume.mainPromise]]}/>
      <button className="mt-3 text-sm text-primary hover:underline" onClick={() => onSelect?.({kind:"volume",id:volume.id})}>查看本卷节奏段与章节</button>
    </section>)}
    {!volumes.length ? <p className="py-5 text-sm text-muted-foreground">分卷规划保存后，可查看每卷的故事、节奏段和章节安排。</p> : null}
  </div>;
}
