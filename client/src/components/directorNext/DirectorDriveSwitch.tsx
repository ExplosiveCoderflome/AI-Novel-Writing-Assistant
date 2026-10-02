import {useMutation,useQueryClient} from "@tanstack/react-query";
import {submitDirectorCommand,type DirectorDriver} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";

export default function DirectorDriveSwitch({runId,novelId,expectedVersion,toDriver}: {runId:string;novelId:string;expectedVersion:number;toDriver:DirectorDriver}) {
  const queries=useQueryClient();
  const mutation=useMutation({mutationFn:()=>submitDirectorCommand({type:"handoff",runId,toDriver,expectedVersion,idempotencyKey:crypto.randomUUID()}),onSuccess:async()=>{await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);}});
  return <div className="py-2"><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{toDriver === "auto" ? "按原范围切换为全自动推进" : "按原范围切换为阶段确认"}</Button>{mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>:null}</div>;
}
