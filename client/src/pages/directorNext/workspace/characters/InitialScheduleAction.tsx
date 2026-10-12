import {useState} from "react";
import {useMutation,useQueryClient} from "@tanstack/react-query";
import {fillDirectorInitialCharacterSchedule} from "@/api/directorNext";
import {useLLMStore} from "@/store/llmStore";
import {Button} from "@/components/ui/button";
import type {WorkspaceBook} from "../model";

export function InitialScheduleAction({book,preview=false}:{book:WorkspaceBook;preview?:boolean}) {
  const queries=useQueryClient();
  const {provider,model}=useLLMStore();
  const [message,setMessage]=useState<string|null>(null);
  const planned=book.planning?.volumes.flatMap(volume=>volume.chapters) ?? [];
  const missing=planned.filter(chapter=>chapter.plannedCharacterIds===undefined && !chapter.taskSheet?.trim() && !chapter.sceneCards?.trim()
    && !book.chapters.find(row=>row.order===chapter.chapterOrder)?.content?.trim());
  const mutation=useMutation({mutationFn:()=>fillDirectorInitialCharacterSchedule(book.novel.id,{provider,model}),
    onSuccess:async response=>{
      const result=response.data;
      setMessage(result ? `补齐 ${result.updated} 章的角色出场安排${result.remaining ? `，另有 ${result.remaining} 章可继续补齐` : ""}。` : "角色出场安排已保存。");
      await Promise.all([
        queries.invalidateQueries({queryKey:["directorBookWorkspace",book.novel.id]}),
        queries.invalidateQueries({queryKey:["director-character-appearances",book.novel.id]}),
      ]);
    }});
  if(preview || !book.materials.characters.length || !missing.length) return message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null;
  return <div className="space-y-2 text-sm">
    <p className="text-muted-foreground">{missing.length} 章缺少角色初排。使用顶部所选模型补齐，每次最多 24 章；保留章节规划和正文。</p>
    <Button variant="secondary" disabled={mutation.isPending || !provider || !model}
      onClick={()=>{setMessage(null);mutation.mutate();}}>{mutation.isPending ? "正在安排角色出场…" : `补齐角色出场安排（${Math.min(24,missing.length)} 章）`}</Button>
    <p className="text-xs text-muted-foreground">此操作会调用 AI；请在本书创作结束后使用。</p>
    {mutation.isError ? <p role="alert" className="text-destructive">{mutation.error.message}</p> : message ? <p role="status" className="text-muted-foreground">{message}</p> : null}
  </div>;
}
