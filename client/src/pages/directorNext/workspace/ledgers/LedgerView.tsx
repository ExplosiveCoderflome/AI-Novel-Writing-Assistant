import {useQuery} from "@tanstack/react-query";
import {getDirectorLedgers} from "@/api/directorNext";
import {Button} from "@/components/ui/button";
import type {Selection,WorkspaceBook} from "../model";
import {ForeshadowLedger} from "./ForeshadowLedger";
import {ResourceLedger} from "./ResourceLedger";

export function LedgerView({book,selection,onSelect,preview=false}:{book:WorkspaceBook;selection:Selection;onSelect:(selection:Selection)=>void;preview?:boolean}) {
  const novelId=book.novel.id;
  const query=useQuery({queryKey:["directorWorkspaceLedgers",novelId],queryFn:async()=>{
    const response=await getDirectorLedgers(novelId);
    if(!response.success || !response.data || response.data.novelId!==novelId) throw new Error("本书伏笔与资源读取失败。");
    return response;
  },enabled:!preview,retry:false,refetchInterval:10000});
  const data=query.data?.data?.novelId===novelId ? query.data.data : null;
  const unreadable=query.isError || Boolean(query.data && (!query.data.success || !data));
  const characterId=selection.kind==="character_resources" ? selection.id : undefined;
  const name=characterId ? book.materials.characters.find(character=>character.id===characterId)?.name : null;
  const foreshadowing=selection.kind==="foreshadowing";
  return <article className="mx-auto max-w-[42rem] px-2 pb-10 sm:px-6" aria-label={foreshadowing ? "本书伏笔" : "背包与资源"}>
    <p className="mb-3 text-xs text-muted-foreground">本书资料 · 全书最新保存状态</p>
    <h2 className="mb-3 text-2xl font-semibold">{foreshadowing ? "伏笔" : name ? `${name} · 背包与资源` : "背包与资源"}</h2>
    <p className="mb-6 text-xs leading-6 text-muted-foreground">包含全书保存的记录，可能透露后续剧情；不代表阅读章节当时的状态。</p>
    {unreadable ? <div role="alert" className="mb-5 space-y-2 bg-destructive/5 p-3"><p className="text-sm text-destructive">伏笔与资源读取失败。{data ? "仍可查看上次读取的记录。" : ""}</p><Button size="sm" variant="ghost" disabled={preview} onClick={()=>void query.refetch()}>重新读取</Button></div> : null}
    {data?.warnings.length ? <ul role="status" className="mb-5 space-y-1 text-xs leading-6 text-warning">{data.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul> : null}
    {data ? foreshadowing ? <ForeshadowLedger book={book} items={data.payoffs} onSelect={onSelect}/> : <ResourceLedger book={book} data={data} characterId={characterId} onSelect={onSelect}/>
      : preview ? <p className="py-10 text-sm text-muted-foreground">此示例未提供伏笔与资源记录。</p>
      : query.isLoading ? <p className="py-10 text-sm text-muted-foreground">正在读取保存的伏笔与资源…</p> : null}
  </article>;
}
