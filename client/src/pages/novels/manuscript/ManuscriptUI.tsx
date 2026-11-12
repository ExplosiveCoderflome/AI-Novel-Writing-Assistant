import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ChapterEditorDiffChunk } from "@ai-novel/shared/types/novel";

export function ManuscriptNotice({ children, error = false }: {children: ReactNode; error?: boolean}) {
  return <div role={error ? "alert" : "status"} className={`rounded-md bg-muted/40 px-4 py-3 text-sm leading-6 ${error ? "text-destructive" : "text-muted-foreground"}`}>{children}</div>;
}
export function DesktopManuscriptNotice() {
  return <section className="mx-auto max-w-xl space-y-4 py-8"><h1 className="text-xl font-semibold">请在电脑端导入或确认结构修订</h1><p className="text-sm leading-7 text-muted-foreground">手机端保持快捷阅读和简单编辑，不会自动发起全书分析、修文或结构变更。</p><Button asChild variant="outline"><Link to="/novels">返回小说</Link></Button></section>;
}
/** Paginate the directory rather than mounting thousands of chapter rows. */
export function ManuscriptDirectory<T extends {id: string}>({items, selectedId, onSelect, render, pageSize = 40}: {
  items:T[]; selectedId:string; onSelect:(id:string)=>void; render:(item:T)=>ReactNode; pageSize?:number;
}) {
  const selectedIndex=items.findIndex(item=>item.id===selectedId);
  const [page,setPage]=useState(Math.max(0,Math.floor(selectedIndex/pageSize)));
  useEffect(()=>{ if(selectedIndex>=0) setPage(Math.floor(selectedIndex/pageSize)); },[selectedId,selectedIndex,pageSize]);
  const pages=Math.max(1,Math.ceil(items.length/pageSize));
  const effectivePage=Math.min(page,pages-1);
  return <><div className="space-y-1">{items.slice(effectivePage*pageSize,(effectivePage+1)*pageSize).map(item=><button type="button" key={item.id} aria-current={item.id===selectedId ? "true" : undefined} onClick={()=>onSelect(item.id)} className={`block w-full rounded-md px-2.5 py-2 text-left text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${item.id===selectedId ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>{render(item)}</button>)}</div>{pages>1 ? <div className="mt-3 flex flex-wrap items-center gap-1 text-xs"><Button size="sm" variant="ghost" disabled={!effectivePage} onClick={()=>setPage(current=>current-1)}>上一页</Button><span className="tabular-nums">{effectivePage+1}/{pages}</span><Button size="sm" variant="ghost" disabled={effectivePage>=pages-1} onClick={()=>setPage(current=>current+1)}>下一页</Button></div>:null}</>;
}
export function ManuscriptDiff({chunks}: {chunks:ChapterEditorDiffChunk[]}) {
  return <div className="manuscript-reading" aria-label="当前稿到候选的差异">{chunks.map(chunk=>chunk.type==="equal"?<span key={chunk.id}>{chunk.text}</span>:chunk.type==="insert"?<ins key={chunk.id} className="manuscript-diff-insert"><span className="sr-only">新增：</span>{chunk.text}</ins>:<del key={chunk.id} className="manuscript-diff-delete"><span className="sr-only">删除：</span>{chunk.text}</del>)}</div>;
}
