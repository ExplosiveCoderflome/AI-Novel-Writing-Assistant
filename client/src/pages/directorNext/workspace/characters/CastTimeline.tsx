import {useMemo, useState, type CSSProperties} from "react";
import {useQuery} from "@tanstack/react-query";
import {ChartNoAxesGantt, ChevronLeft, ChevronRight, CircleDashed, History, MessageCircle, Moon, UsersRound} from "lucide-react";
import type {DirectorNovelCharacterAppearances} from "@ai-novel/shared/types/director/characterAppearances";
import {getDirectorNovelCharacterAppearances} from "@/api/directorNext";
import {Button} from "@/components/ui/button";
import {InitialScheduleAction} from "./InitialScheduleAction";
import type {Selection, WorkspaceBook} from "../model";
import {appearanceDestination, appearanceLabels, appearanceTimelinePage, projectCastAppearanceRows, type AppearanceRow} from "./appearanceModel";
import "./castTimeline.css";

const eventIcons = {mention: MessageCircle, flashback: History, dream: Moon};
const otherKinds = ["mention", "flashback", "dream"] as const;
const emptyChapters: DirectorNovelCharacterAppearances["chapters"] = [];
const coverageText = {
  unwritten: {label: "待写正文", short: "待写"},
  untracked: {label: "正文未核对", short: "待核"},
  recorded: {label: "正文已核对", short: "已核"},
};

function coverageRuns(rows: AppearanceRow[]) {
  const runs: {coverage: AppearanceRow["coverage"]; first: number; last: number; length: number}[] = [];
  for (const row of rows) {
    const run = runs.at(-1);
    if (run && run.coverage === row.coverage && run.last + 1 === row.chapterOrder) {
      run.last = row.chapterOrder;
      run.length++;
    } else {
      runs.push({coverage: row.coverage, first: row.chapterOrder, last: row.chapterOrder, length: 1});
    }
  }
  return runs;
}

function isPresent(row?: AppearanceRow) {
  return row?.events.some(event => event.kind === "present") ?? false;
}

function AppearanceCell({row, previous, next, name, onSelect}: {
  row: AppearanceRow; previous?: AppearanceRow; next?: AppearanceRow; name: string; onSelect: (selection: Selection)=>void;
}) {
  const planLabel = row.planned ? "计划出场" : row.chapterId === null && !row.planSource ? "出场安排待生成"
    : row.planSource ? "未安排现场出场" : "暂无明确出场安排";
  const events = row.events.map(event => `${appearanceLabels[event.kind]}：${event.summary}`);
  const coverageLabel = row.coverage === "untracked" ? "未核对，不能判断是否缺席" : row.coverage === "unwritten" ? "待写正文" : "";
  const label = `${name} · 第 ${row.chapterOrder} 章 · ${row.chapterTitle}：${[planLabel, ...events, coverageLabel || (events.length ? "" : "无出场记录")].filter(Boolean).join("；")}`;
  const before = previous?.chapterOrder === row.chapterOrder - 1 ? previous : undefined;
  const after = next?.chapterOrder === row.chapterOrder + 1 ? next : undefined;
  return <button type="button" onClick={()=>onSelect(appearanceDestination(row))} title={label} aria-label={label}
    className="cast-cell">
    <span aria-hidden="true" className="cast-track">
      {row.planned && <span className="cast-bar cast-plan" data-start={!before?.planned} data-end={!after?.planned}/>}
    </span>
    <span aria-hidden="true" className="cast-track">
      {isPresent(row) && <span data-appearance-kind="present" className="cast-bar cast-actual" data-start={!isPresent(before)} data-end={!isPresent(after)}/>}
      {row.coverage === "recorded" && !row.events.length && <span className="cast-no-record"/>}
    </span>
    <span aria-hidden="true" className="cast-event-marks">
      {otherKinds.map(kind => {
        if (!row.events.some(event => event.kind === kind)) return null;
        const Icon = eventIcons[kind];
        return <Icon key={kind} data-appearance-kind={kind}/>;
      })}
    </span>
  </button>;
}

export function CastTimelineChart({book, chapters, onSelect}: {
  book: WorkspaceBook; chapters: DirectorNovelCharacterAppearances["chapters"]; onSelect: (selection: Selection)=>void;
}) {
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const axis = useMemo(()=>projectCastAppearanceRows(chapters, null, book.planning), [chapters, book.planning]);
  const cast = useMemo(()=>book.materials.characters.map(character=>({character,
    rows: projectCastAppearanceRows(chapters, character.id, book.planning),
  })), [chapters, book.materials.characters, book.planning]);
  const window = appearanceTimelinePage(axis, "latest", requestedPage);
  if (!cast.length) return <p className="text-sm text-muted-foreground">本书暂无角色。角色资料保存后，可在这里查看出场安排。</p>;
  if (!axis.length) return <p className="text-sm text-muted-foreground">本书暂无章节规划。章节规划保存后，会显示各角色的出场时间线。</p>;
  const start = window.page * 24;
  const range = `第 ${window.rows[0].chapterOrder}—${window.rows[window.rows.length-1].chapterOrder} 章`;
  const pending = axis.filter(row=>row.chapterId === null && !row.planSource).length;
  const unknown = axis.filter(row=>row.coverage === "untracked").length;
  const visibleKinds = otherKinds.filter(kind => window.rows.some(row => row.events.some(event => event.kind === kind)));
  return <figure className="cast-timeline min-w-0 space-y-3" aria-label="全员角色出场甘特图">
    <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UsersRound aria-hidden="true" className="size-4 text-muted-foreground"/>
        <span>{cast.length} 位角色 · {axis.length} 章</span>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
        {window.pageCount > 1 && <Button variant="ghost" size="icon" className="size-8" aria-label="上一段" title="上一段" disabled={window.page===0} onClick={()=>setRequestedPage(window.page-1)}><ChevronLeft className="size-4"/></Button>}
        <span aria-live="polite" className="px-2 py-1.5 font-medium tabular-nums">{range}</span>
        {window.pageCount > 1 && <Button variant="ghost" size="icon" className="size-8" aria-label="下一段" title="下一段" disabled={window.page===window.pageCount-1} onClick={()=>setRequestedPage(window.page+1)}><ChevronRight className="size-4"/></Button>}
      </div>
    </figcaption>
    <div key={window.page} role="region" aria-label={`全员出场章节轴，${range}`} tabIndex={0}
      className="cast-scroll max-h-[65dvh] overflow-auto overscroll-contain rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <table className="cast-grid" style={{"--cast-columns": window.rows.length} as CSSProperties} aria-label="角色与章节出场对照">
        <colgroup><col className="cast-name-column"/><col span={window.rows.length}/></colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" rowSpan={2} className="cast-axis-name">角色 <span className="block text-xs font-normal opacity-75">章节 →</span></th>
            {window.rows.map(row => <th key={row.chapterOrder} scope="col" className="cast-tick"
              title={`第 ${row.chapterOrder} 章 · ${row.chapterTitle}${row.chapterId === null && !row.planSource ? " · 出场安排待生成" : ""}`}>
              {row.chapterOrder}{row.chapterId === null && !row.planSource && <CircleDashed className="ml-0.5 inline size-2.5" aria-label="出场安排待生成"/>}
            </th>)}
          </tr>
          <tr>{coverageRuns(window.rows).map(run => {
            const {label, short} = coverageText[run.coverage];
            const description = `第 ${run.first}${run.first === run.last ? "" : `—${run.last}`} 章 · ${label}`;
            return <td key={run.first} colSpan={run.length} className="cast-coverage" data-coverage={run.coverage} title={description} aria-label={description}>
              <span>{run.length < 3 ? short : label}</span>
            </td>;
          })}</tr>
        </thead>
        <tbody>{cast.map(({character, rows}) => {
          const visible = rows.slice(start, start + window.rows.length);
          const identity = character.role?.trim() || character.identityLabel?.trim();
          return <tr key={character.id}>
            <th scope="row" className="cast-name">
              <button type="button" title={[character.name, identity].filter(Boolean).join(" · ")} onClick={()=>onSelect({kind:"character",id:character.id})}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-semibold">{character.name}</span>
                  {character.castRole === "protagonist" && <span className="shrink-0 rounded bg-info/10 px-1 text-[10px] font-medium text-info">主角</span>}
                </span>
                {identity && <span className="block truncate text-xs font-normal text-muted-foreground">{identity}</span>}
              </button>
            </th>
            {visible.map((row, index) => <td key={appearanceDestination(row).id}>
              <AppearanceCell row={row} previous={visible[index-1]} next={visible[index+1]} name={character.name} onSelect={onSelect}/>
            </td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="cast-legend" aria-label="图例">
      <span><i aria-hidden="true" className="cast-plan"/>计划出场</span>
      <span><i aria-hidden="true" className="cast-actual"/>实际出场</span>
      {visibleKinds.map(kind => {
        const Icon = eventIcons[kind];
        return <span key={kind}><Icon aria-hidden="true"/>{appearanceLabels[kind]}</span>;
      })}
      {window.rows.some(row => row.chapterId === null && !row.planSource) && <span><CircleDashed aria-hidden="true"/>安排待生成</span>}
      {window.rows.some(row => row.coverage === "recorded") && <span><i aria-hidden="true" className="cast-no-record"/>无出场记录</span>}
    </div>
    {pending > 0 && <p className="text-xs leading-5 text-muted-foreground">{pending} 章尚待生成角色出场安排，正文保存并整理后会补充实际记录。</p>}
    {unknown > 0 && <p className="text-xs leading-5 text-muted-foreground">{unknown} 章尚未核对当前正文的出场记录，不能据此判断角色缺席。</p>}
  </figure>;
}

export function CastTimeline({book, onSelect, preview=false}: {book: WorkspaceBook; onSelect: (selection: Selection)=>void; preview?: boolean}) {
  const query = useQuery({queryKey:["director-character-appearances",book.novel.id,"overview"],
    queryFn:()=>getDirectorNovelCharacterAppearances(book.novel.id), enabled:!preview, retry:false, refetchInterval:10000});
  return <div className="min-w-0 space-y-5 px-2 pb-10 sm:px-6">
    <header className="flex items-start gap-3">
      <ChartNoAxesGantt aria-hidden="true" className="mt-1 size-6 shrink-0 text-info"/>
      <div><h2 className="text-2xl font-semibold leading-tight">角色时间线</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">点选角色查看资料，点选章节格查看出场依据或章节规划。</p>
      </div>
    </header>
    <InitialScheduleAction book={book} preview={preview}/>
    {query.isError ? <p role="alert" className="text-sm text-destructive">出场记录读取失败。<Button variant="ghost" size="sm" onClick={()=>void query.refetch()}>重新读取</Button></p>
      : query.isLoading && !preview ? <p className="text-sm text-muted-foreground">正在读取全员出场记录…</p>
      : <CastTimelineChart key={book.novel.id} book={book} chapters={query.data?.data?.chapters ?? emptyChapters} onSelect={onSelect}/>}
  </div>;
}
