import {useMutation,useQueryClient} from "@tanstack/react-query";
import {createDirectorCommandKey,submitDirectorCommand,type DirectorDriver} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";

export default function DirectorDriveSwitch({runId,novelId,expectedVersion,toDriver,label,disabled=false}: {runId:string;novelId:string;expectedVersion:number;toDriver:DirectorDriver;label:string;disabled?:boolean}) {
  const queries=useQueryClient();
  const mutation=useMutation({mutationFn:()=>submitDirectorCommand({type:"handoff",runId,toDriver,expectedVersion,idempotencyKey:createDirectorCommandKey()}),onSuccess:async()=>{await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);}});
  return <div className="py-2"><Button size="sm" variant="ghost" disabled={disabled || mutation.isPending} onClick={()=>mutation.mutate()}>{label}</Button>{mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>:null}</div>;
}
