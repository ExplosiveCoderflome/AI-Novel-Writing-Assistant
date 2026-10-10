import {useQuery} from "@tanstack/react-query";
import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {getDirectorCharacterAppearances} from "@/api/directorNext";
import {Button} from "@/components/ui/button";
import {appearanceDestination, appearanceLabels, projectAppearanceRows, summarizeAppearances, visibleAppearances, type AppearanceBoundary, type AppearanceRow, type AppearanceDestination} from "./appearanceModel";
import {AppearanceTimeline} from "./AppearanceTimeline";

const chapterLabel = (order: number | null) => order === null ? "暂无记录" : `第 ${order} 章`;

export function AppearanceList({rows, boundary, onSelect}: {
  rows: AppearanceRow[]; boundary: AppearanceBoundary; onSelect: (target:AppearanceDestination)=>void;
}) {
  if (boundary === null) return <p className="text-sm text-muted-foreground">选择阅读章节，或切换到“最新状态”查看全书出场记录。</p>;
  const stats = summarizeAppearances(rows, boundary);
  const visible = visibleAppearances(rows, boundary);
  const recorded = visible.filter(row => row.events.length > 0);
  const planned = visible.filter(row => row.planned);
  const unknown = visible.filter(row => row.coverage === "untracked").length;
  const pending = visible.filter(row => row.chapterId === null && !row.planSource).length;
  const awaitingProse = visible.length > 0 && visible.every(row=>row.coverage === "unwritten");
  return <div className="min-w-0 space-y-4 text-sm leading-6">
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      <div><dt className="text-muted-foreground">首次有记录的出场</dt><dd>{chapterLabel(stats.first)}</dd></div>
      <div><dt className="text-muted-foreground">最近出场</dt><dd>{chapterLabel(stats.last)}</dd></div>
      <div><dt className="text-muted-foreground">实际出场章数</dt><dd>{awaitingProse ? "待正文生成" : `${stats.count} 章`}</dd></div>
    </dl>
    {pending > 0 ? <p className="text-sm text-muted-foreground">此范围已保存章节规划，其中 {pending} 章的角色出场安排待生成。启动对应章节创作时，会先准备章节任务；最终正文保存并整理后，才会建立实际出场记录。</p> : null}
    <AppearanceTimeline key={String(boundary)} rows={rows} boundary={boundary} onSelect={onSelect}/>
    <div><h4 className="font-medium">计划出场章节</h4>
      <p className="text-xs text-muted-foreground">根据章节初排与详细任务安排；详细任务优先，正文记录用于核对实际出场。</p>
      {planned.length ? <div className="mt-2 flex flex-wrap gap-1">{planned.map(row=><Button key={appearanceDestination(row).id} size="sm" variant="ghost" onClick={()=>onSelect(appearanceDestination(row))}>第 {row.chapterOrder} 章</Button>)}</div>
        : <p className="mt-2 text-muted-foreground">{pending > 0 ? "角色出场安排待章节任务生成后补齐。" : "此范围尚无明确的出场安排。"}</p>}
    </div>
    {stats.missed.length > 0 ? <p className="text-muted-foreground">第 {stats.missed.join("、")} 章计划出场，但正文记录未确认实际出场，可核对安排；此提醒不暂停创作。</p> : null}
    {unknown > 0 ? <p className="text-xs text-muted-foreground">{unknown} 章缺少当前正文版本的完整出场记录，不计作缺席。</p> : null}
    {recorded.length ? <ol className="divide-y divide-border/40">{recorded.map(row=><li key={appearanceDestination(row).id} className="space-y-2 py-3">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={()=>onSelect(appearanceDestination(row))}>第 {row.chapterOrder} 章 · {row.chapterTitle}</Button>
      {row.events.map(event=><div key={event.kind} className="space-y-1"><p><span className="mr-2 text-xs text-muted-foreground">{appearanceLabels[event.kind]}</span>{event.summary}</p>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">正文依据</summary><p className="mt-1 whitespace-pre-wrap">{event.evidence}</p></details></div>)}
    </li>)}</ol> : <p className="text-muted-foreground">此范围暂无已核对的角色出场记录。</p>}
  </div>;
}

export function CharacterAppearances({novelId, characterId, boundary, onSelect, planning, preview=false}: {
  novelId: string; characterId: string; boundary: AppearanceBoundary; onSelect: (target:AppearanceDestination)=>void; planning?:VolumePlanDocument; preview?:boolean;
}) {
  const query = useQuery({queryKey: ["director-character-appearances", novelId, characterId],
    queryFn: ()=>getDirectorCharacterAppearances(novelId,characterId), enabled: !preview, retry:false, refetchInterval:10000});
  return <section className="min-w-0 space-y-3 py-5"><h3 className="text-sm font-semibold">角色出场时间线</h3>
    {query.isError ? <p role="alert" className="text-sm text-destructive">出场记录读取失败。<Button variant="ghost" size="sm" onClick={()=>void query.refetch()}>重新读取</Button></p>
      : query.isLoading && !preview ? <p className="text-sm text-muted-foreground">正在读取出场记录…</p>
      : <AppearanceList key={characterId} rows={projectAppearanceRows(query.data?.data?.chapters ?? [],planning,characterId)} boundary={boundary} onSelect={onSelect}/>}
  </section>;
}
