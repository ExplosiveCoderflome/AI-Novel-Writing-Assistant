import {Button} from "@/components/ui/button";
import type {Selection,WorkspaceBook} from "../model";
import {resolveLedgerChapter} from "./model";

export function SourceChapter({book,source,onSelect,label="来源"}:{book:WorkspaceBook;source:{chapterId?:string|null;chapterOrder?:number|null};onSelect:(selection:Selection)=>void;label?:string}) {
  const chapter=resolveLedgerChapter(book,source);
  if(!source.chapterId && !source.chapterOrder) return null;
  return chapter ? <Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal px-0 text-left text-xs text-primary hover:bg-transparent" onClick={()=>onSelect({kind:"chapter",id:chapter.id})}>{label}：第 {chapter.order} 章 · {chapter.title}</Button>
    : <p className="text-xs text-muted-foreground">{label}：{source.chapterOrder ? `第 ${source.chapterOrder} 章（来源正文不可用）` : "来源正文不可用"}</p>;
}

export function SavedSources({book,evidence,sources,onSelect}:{book:WorkspaceBook;evidence:{summary:string;chapterId?:string|null;chapterOrder?:number|null}[];sources:{refLabel:string;chapterId?:string|null;chapterOrder?:number|null}[];onSelect:(selection:Selection)=>void}) {
  return <section className="space-y-3"><h4 className="text-xs font-medium text-muted-foreground">保存证据与来源</h4>
    {!evidence.length && !sources.length ? <p className="text-sm text-muted-foreground">暂无证据记录。</p> : null}
    {evidence.map((row,index)=><div key={`e${index}`}><p className="whitespace-pre-wrap text-sm leading-7">{row.summary}</p><SourceChapter book={book} source={row} onSelect={onSelect}/></div>)}
    {sources.map((row,index)=><div key={`s${index}`}><p className="text-sm leading-7">{row.refLabel}</p><SourceChapter book={book} source={row} onSelect={onSelect}/></div>)}
  </section>;
}
