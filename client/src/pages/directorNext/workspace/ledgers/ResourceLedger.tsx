import {useState} from "react";
import type {DirectorWorkspaceLedgers} from "@ai-novel/shared/types/director/workspace";
import type {Selection,WorkspaceBook} from "../model";
import {characterResources,chapterWindow,resourceEventLabels,resourceFunctionLabels,resourceStatusLabels} from "./model";
import {SavedSources,SourceChapter} from "./SavedSources";

export function ResourceLedger({book,data,characterId,onSelect}:{book:WorkspaceBook;data:DirectorWorkspaceLedgers;characterId?:string;onSelect:(selection:Selection)=>void}) {
  const [status,setStatus]=useState("all");
  const saved=characterResources(data.resources,book.novel.id,characterId);
  const filtered=saved.filter(item=>status==="all" || item.status===status);
  return <>
    <div className="mb-5 flex flex-wrap gap-3 text-sm">
      <label className="flex items-center gap-2">角色<select className="max-w-full rounded-md border border-input bg-background px-3 py-2" value={characterId ?? ""} onChange={event=>onSelect(event.target.value ? {kind:"character_resources",id:event.target.value} : {kind:"resources"})}><option value="">全书资源</option>{book.materials.characters.map(character=><option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label className="flex items-center gap-2">状态<select className="rounded-md border border-input bg-background px-3 py-2" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(resourceStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <p className="mb-3 text-xs leading-6 text-muted-foreground">共 {saved.length} 项。角色列表包含其持有或拥有的资源；归属与使用限制以保存记录为准。</p>
    {!filtered.length ? <p className="py-10 text-sm leading-7 text-muted-foreground">{saved.length ? "该状态下暂无资源。" : "暂无保存的资源记录。章节资源回填保存后可在这里查看。"}</p> : null}
    <div className="divide-y divide-border/40">{filtered.map(item=><section key={item.id} className="space-y-3 py-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-semibold">{item.name}</h3><span className="text-xs text-muted-foreground">{resourceStatusLabels[item.status] ?? "状态未识别"} · {resourceFunctionLabels[item.narrativeFunction] ?? "用途未标注"}</span></div>
      <p className="whitespace-pre-wrap text-sm leading-7">{item.summary}</p>
      <dl className="grid gap-x-6 gap-y-2 text-xs leading-6 sm:grid-cols-2"><div><dt className="inline text-muted-foreground">持有者：</dt><dd className="inline">{item.holderCharacterName || "未标注"}</dd></div><div><dt className="inline text-muted-foreground">所有者：</dt><dd className="inline">{item.ownerName || "未标注"}</dd></div><div><dt className="inline text-muted-foreground">读者知情：</dt><dd className="inline">{item.readerKnows ? "是" : "否"}</dd></div><div><dt className="inline text-muted-foreground">持有者知情：</dt><dd className="inline">{item.holderKnows ? "是" : "否"}</dd></div></dl>
      {item.constraints.length ? <ul className="space-y-1 text-sm leading-7">{item.constraints.map((constraint,index)=><li key={index}>使用限制：{constraint}</li>)}</ul> : null}
      <p className="text-xs text-muted-foreground">预计使用范围：{chapterWindow(item.expectedUseStartChapterOrder,item.expectedUseEndChapterOrder)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2"><SourceChapter book={book} source={{chapterId:item.introducedChapterId,chapterOrder:item.introducedChapterOrder}} label="首次出现" onSelect={onSelect}/><SourceChapter book={book} source={{chapterId:item.lastTouchedChapterId,chapterOrder:item.lastTouchedChapterOrder}} label="最近变化" onSelect={onSelect}/></div>
      {item.riskSignals.length ? <ul className="space-y-1 text-sm leading-6 text-warning">{item.riskSignals.map((risk,index)=><li key={index}>{risk.summary}{risk.stale ? "（历史提醒）" : ""}</li>)}</ul> : null}
      <details><summary className="cursor-pointer text-xs text-muted-foreground">查看变化、证据与来源</summary><div className="space-y-5 pt-4"><SavedSources book={book} evidence={item.evidence} sources={item.sourceRefs} onSelect={onSelect}/>
        <section><h4 className="mb-3 text-xs font-medium text-muted-foreground">资源变化记录</h4>{data.resourceEvents.filter(event=>event.resourceId===item.id).map(event=><div key={event.id} className="mb-4 space-y-1"><p className="text-sm font-medium">{resourceEventLabels[event.eventType] ?? "资源变化"}</p><p className="whitespace-pre-wrap text-sm leading-7">{event.summary}</p>{event.evidence.map((evidence,index)=><p key={index} className="text-xs leading-6 text-muted-foreground">{evidence}</p>)}<SourceChapter book={book} source={event} onSelect={onSelect}/></div>)}{!data.resourceEvents.some(event=>event.resourceId===item.id) ? <p className="text-sm text-muted-foreground">暂无保存的变化记录。</p> : null}</section>
      </div></details>
    </section>)}</div>
    {data.pendingResources.length ? <details className="mt-6 bg-muted/30 px-4 py-3" open><summary className="cursor-pointer text-sm font-medium">全书待核对资源 · {data.pendingResources.length} 项</summary><p className="mt-3 text-xs leading-6 text-muted-foreground">以下变化尚未用于后续写作。它们是待核对提示，不能当作角色已获得的资源。</p><div className="divide-y divide-border/40">{data.pendingResources.map(proposal=><section key={proposal.id} className="space-y-2 py-4"><p className="text-sm font-medium">{proposal.summary}</p><ul className="text-xs leading-6 text-muted-foreground">{proposal.validationNotes.map((note,index)=><li key={index}>{note}</li>)}{proposal.evidence.map((evidence,index)=><li key={`e${index}`}>证据：{evidence}</li>)}</ul><SourceChapter book={book} source={proposal} onSelect={onSelect}/></section>)}</div></details> : null}
  </>;
}
