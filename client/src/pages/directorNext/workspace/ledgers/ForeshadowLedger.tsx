import {useState} from "react";
import type {PayoffLedgerItem} from "@ai-novel/shared/types/payoffLedger";
import type {Selection,WorkspaceBook} from "../model";
import {chapterWindow,payoffStatusLabels} from "./model";
import {SavedSources,SourceChapter} from "./SavedSources";

export function ForeshadowLedger({book,items,onSelect}:{book:WorkspaceBook;items:PayoffLedgerItem[];onSelect:(selection:Selection)=>void}) {
  const [status,setStatus]=useState("all");
  const saved=items.filter(item=>item.novelId===book.novel.id);
  const filtered=saved.filter(item=>status==="all" || item.currentStatus===status);
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">共 {saved.length} 项 · 已兑现 {saved.filter(item=>item.currentStatus==="paid_off").length} 项</p>
      <label className="flex items-center gap-2 text-sm">状态<select className="rounded-md border border-input bg-background px-3 py-2" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(payoffStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {!filtered.length ? <p className="py-10 text-sm leading-7 text-muted-foreground">{saved.length ? "该状态下暂无伏笔。" : "暂无保存的伏笔记录。规划或章节资源回填保存后可在这里查看。"}</p> : null}
    <div className="divide-y divide-border/40">{filtered.map(item=><section key={item.id} className="space-y-3 py-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-semibold">{item.title}</h3><span className="text-xs text-muted-foreground">{payoffStatusLabels[item.currentStatus] ?? "状态未识别"}</span></div>
      <p className="whitespace-pre-wrap text-sm leading-7">{item.summary}</p>
      <p className="text-xs text-muted-foreground">兑现窗口：{chapterWindow(item.targetStartChapterOrder,item.targetEndChapterOrder)}</p>
      {item.statusReason ? <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">{item.statusReason}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2"><SourceChapter book={book} source={{chapterId:item.setupChapterId,chapterOrder:item.firstSeenChapterOrder}} label="埋设" onSelect={onSelect}/><SourceChapter book={book} source={{chapterId:item.payoffChapterId}} label="兑现" onSelect={onSelect}/><SourceChapter book={book} source={{chapterId:item.lastTouchedChapterId,chapterOrder:item.lastTouchedChapterOrder}} label="最近变化" onSelect={onSelect}/></div>
      {item.riskSignals.length ? <ul className="space-y-1 text-sm leading-6 text-warning">{item.riskSignals.map((risk,index)=><li key={index}>{risk.summary}{risk.stale ? "（历史提醒）" : ""}</li>)}</ul> : null}
      <details className="pt-1"><summary className="cursor-pointer text-xs text-muted-foreground">查看保存证据与来源</summary><div className="pt-4"><SavedSources book={book} evidence={item.evidence} sources={item.sourceRefs} onSelect={onSelect}/></div></details>
    </section>)}</div>
  </>;
}
