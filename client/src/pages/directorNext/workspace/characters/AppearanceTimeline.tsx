import {useState} from "react";
import type {CharacterAppearance} from "@ai-novel/shared/types/director/characterAppearances";
import {Button} from "@/components/ui/button";
import {appearanceDestination, appearanceLabels, appearanceTimelinePage, type AppearanceBoundary, type AppearanceRow, type AppearanceDestination} from "./appearanceModel";

const symbols = {present: "●", mention: "△", flashback: "◆", dream: "☾"};
const eventKinds: CharacterAppearance["kind"][] = ["present", "mention", "flashback", "dream"];
const nodeClass = "relative h-8 w-9 bg-background p-0 text-lg";

function ChapterNode({row, label, symbol, onSelect, active = false}: {
  row: AppearanceRow; label: string; symbol: string; onSelect: (target:AppearanceDestination)=>void; active?: boolean;
}) {
  const description = `第 ${row.chapterOrder} 章 · ${row.chapterTitle}：${label}`;
  return <Button type="button" variant="ghost" size="sm"
    className={`${nodeClass} ${active ? "font-bold text-primary" : "text-muted-foreground"}`}
    aria-label={description} title={description} onClick={()=>onSelect(appearanceDestination(row))}>
    <span aria-hidden="true">{symbol}</span>
  </Button>;
}

export function AppearanceTimeline({rows, boundary, onSelect}: {
  rows: AppearanceRow[]; boundary: AppearanceBoundary; onSelect: (target:AppearanceDestination)=>void;
}) {
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const window = appearanceTimelinePage(rows, boundary, requestedPage);
  if (!window.rows.length) return null;
  const range = `第 ${window.rows[0].chapterOrder}—${window.rows[window.rows.length-1].chapterOrder} 章`;
  return <figure className="min-w-0 max-w-full space-y-3" aria-label="角色出场示意图">
    <figcaption className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-medium">出场示意图</h4>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {window.pageCount > 1 ? <Button type="button" variant="ghost" size="sm" aria-label="查看前一段章节"
          disabled={window.page===0} onClick={()=>setRequestedPage(window.page-1)}>上一段</Button> : null}
        <span aria-live="polite">{range}</span>
        {window.pageCount > 1 ? <Button type="button" variant="ghost" size="sm" aria-label="查看后一段章节"
          disabled={window.page===window.pageCount-1} onClick={()=>setRequestedPage(window.page+1)}>下一段</Button> : null}
      </div>
    </figcaption>
    <p className="text-xs text-muted-foreground">按章节顺序查看，点击符号打开对应章节；横向滚动可查看本段其余章节。</p>
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="region" aria-label={`出场章节轴，${range}`} tabIndex={0}>
      <table className="w-full border-collapse text-center text-xs" aria-label="计划与正文出场对照">
        <thead><tr>
          <th scope="col" className="sticky left-0 z-10 min-w-16 bg-background px-2 py-2 text-left font-normal text-muted-foreground">章节</th>
          {window.rows.map(row=><th key={appearanceDestination(row).id} scope="col" className="min-w-12 px-1 py-2 font-normal text-muted-foreground">{row.chapterOrder}</th>)}
        </tr></thead>
        <tbody>{["planned", "actual"].map(lane=><tr key={lane}>
          <th scope="row" className="sticky left-0 z-10 bg-background px-2 py-3 text-left align-top font-medium">{lane==="planned" ? "计划出场" : "正文记录"}</th>
          {window.rows.map(row=><td key={appearanceDestination(row).id} className="relative px-1 py-3 align-top">
            <span aria-hidden="true" className="absolute inset-x-0 top-7 h-px bg-border/70"/>
            <div className="relative flex flex-col items-center gap-1">
              {lane==="planned" ? row.chapterId === null && !row.planSource
                ? <ChapterNode row={row} label="出场安排待生成，查看章节规划" symbol="◌" onSelect={onSelect}/>
                : row.planned ? <ChapterNode row={row} label="计划出场" symbol="○" onSelect={onSelect}/>
                  : <span className="relative inline-flex h-8 items-center bg-background px-2 text-muted-foreground" aria-label="暂无明确出场安排">—</span>
                : <>
                  {eventKinds.filter(kind=>row.events.some(event=>event.kind===kind)).map(kind=><ChapterNode key={kind} row={row}
                    label={`${appearanceLabels[kind]}：${row.events.find(event=>event.kind===kind)!.summary}`} symbol={symbols[kind]} active={kind==="present"} onSelect={onSelect}/>)}
                  {row.coverage!=="recorded" ? <ChapterNode row={row} label={row.coverage==="untracked" ? "未核对，不能判断是否缺席" : "待写正文"}
                    symbol={row.coverage==="untracked" ? "?" : "…"} onSelect={onSelect}/>
                    : !row.events.length ? <span className="relative inline-flex h-8 items-center bg-background px-2 text-muted-foreground" aria-label="已核对，未记录出场">—</span> : null}
                </>}
            </div>
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="示意图图例">
      <span>○ 计划出场</span>
      {eventKinds.map(kind=><span key={kind}>{symbols[kind]} {appearanceLabels[kind]}</span>)}
      <span>◌ 出场安排待生成</span><span>? 未核对</span><span>… 待写正文</span><span>— 无对应记录</span>
    </div>
  </figure>;
}
