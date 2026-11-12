import {useRef} from "react";
import {useMutation,useQueryClient} from "@tanstack/react-query";
import type {OutlineBookBindingView} from "@ai-novel/shared/types/outlineOpenBook";
import {retryOutlineBookSetup} from "@/api/outlines";
import {createDirectorCommandKey} from "@/api/directorNext";
import {Button} from "@/components/ui/button";
export function OutlineSetupRecovery({binding}:{binding:OutlineBookBindingView}) {
  const key=useRef(createDirectorCommandKey()),queries=useQueryClient();
  const retry=useMutation({mutationFn:()=>retryOutlineBookSetup(binding.projectId,binding.policyVersion,key.current),onSuccess:async()=>{
    await Promise.all([queries.invalidateQueries({queryKey:["outline-book-binding",binding.projectId]}),queries.invalidateQueries({queryKey:["directorBookWorkspace",binding.novelId]})]);
  }});
  return <div role="status" className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-warning">资料索引待恢复；本书与规划已保留，无需重新开书。</span><Button size="sm" variant="ghost" disabled={retry.isPending} onClick={()=>retry.mutate()}>{retry.isPending ? "正在恢复…" : "恢复本书资料索引"}</Button>{retry.isError ? <p role="alert" className="w-full text-destructive">{retry.error.message}</p> : null}</div>;
}
