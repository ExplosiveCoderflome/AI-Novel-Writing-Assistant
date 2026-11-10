import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskKind } from "@ai-novel/shared/types/task";
import { cancelTask, deleteTask, isTaskRecordActive } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/** Source pages own stop; history surfaces may only remove finished records. */
export function TaskRecordActions({ kind, id, status, title, allowStop = false, allowDelete = true }: {
  kind: TaskKind; id: string; status: string; title: string; allowStop?: boolean; allowDelete?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const cache = useQueryClient();
  const active = isTaskRecordActive(status);
  useEffect(() => { if (!active) setStopRequested(false); }, [active, id]);
  const mutation = useMutation({
    mutationFn: async (action: "stop" | "delete") => {
      if (action === "stop") await cancelTask(kind, id);
      else await deleteTask(kind, id);
    },
    onSuccess: async (_data, action) => {
      setConfirm(false);
      if (action === "stop") setStopRequested(true);
      await Promise.all(["tasks", "book-analysis", "auto-director-follow-ups", "novels", "images", "style-engine"].map(key =>
        cache.invalidateQueries({ queryKey: [key] }),
      ));
    },
  });
  return <div className="space-y-1" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-2">
      {active && allowStop ? <Button size="sm" variant="outline" disabled={mutation.isPending || stopRequested} onClick={() => mutation.mutate("stop")}>{mutation.isPending || stopRequested ? "正在停止…" : "停止"}</Button> : null}
      {allowDelete ? <Button size="sm" variant="ghost" className="hidden text-destructive sm:inline-flex" disabled={active || mutation.isPending} title={active ? "请先到来源页面停止任务，再删除记录" : "删除此记录"} onClick={() => setConfirm(true)}>删除</Button> : null}
      {active && allowDelete ? <span className="hidden text-xs text-muted-foreground sm:inline">请先停止任务再删除</span> : null}
    </div>
    {mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p> : null}
    <Dialog open={confirm} onOpenChange={open => { if (!mutation.isPending) setConfirm(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>删除这条记录？</DialogTitle><DialogDescription>“{title}”将从列表移除。已保存的小说、章节、分析内容和来源资料会保留。</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirm(false)}>保留记录</Button><Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate("delete")}>{mutation.isPending ? "正在删除…" : "确认删除"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
