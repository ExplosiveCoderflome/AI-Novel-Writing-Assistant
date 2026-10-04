import {useMutation,useQueryClient} from "@tanstack/react-query";
import {submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";

export default function DirectorGate({runId,novelId,expectedVersion}: {runId:string;novelId:string;expectedVersion:number}) {
  const queries=useQueryClient();
  const mutation=useMutation({mutationFn:(decision:"confirm"|"confirm_after_edit"|"regenerate")=>submitDirectorCommand({type:"resolve_gate",runId,decision,expectedVersion,idempotencyKey:crypto.randomUUID()}),
    onSuccess:async()=>{await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);}});
  return <section className="space-y-3 border-t border-border/50 py-4"><p className="text-xs leading-5 text-muted-foreground">请核对左侧本阶段结果，确认后 AI 按本次授权范围继续。</p><Button disabled={mutation.isPending} onClick={()=>mutation.mutate('confirm')}>确认结果并继续</Button><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate('confirm_after_edit')}>确认已保存的修改</Button><Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate('regenerate')}>重新生成本阶段</Button></div>{mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>:null}</section>;
}
