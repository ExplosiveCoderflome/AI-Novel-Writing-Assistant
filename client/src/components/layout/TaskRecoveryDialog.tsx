import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecoverableTaskSummary } from "@ai-novel/shared/types/task";
import { Link } from "react-router-dom";
import {
  listRecoveryCandidates,
  resumeAllRecoveryCandidates,
  resumeRecoveryCandidate,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

function formatTaskKind(kind: RecoverableTaskSummary["kind"]): string {
  if (kind === "novel_workflow") {
    return "小说主流程";
  }
  if (kind === "novel_pipeline") {
    return "章节流水线";
  }
  if (kind === "book_analysis") {
    return "拆书任务";
  }
  return "图片任务";
}

export default function TaskRecoveryDialog() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const recoveryQuery = useQuery({
    queryKey: queryKeys.tasks.recoveryCandidates,
    queryFn: listRecoveryCandidates,
    staleTime: 10_000,
  });

  const items = recoveryQuery.data?.data?.items ?? [];
  const open = !dismissed && items.length > 0;

  useEffect(() => {
    if (items.length === 0) {
      setDismissed(false);
    }
  }, [items.length]);

  const refreshTaskState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
    ]);
  };

  const resumeSingleMutation = useMutation({
    mutationFn: (input: { kind: RecoverableTaskSummary["kind"]; id: string }) => resumeRecoveryCandidate(input.kind, input.id),
    onSuccess: async () => {
      toast.success("任务已恢复运行。");
      await refreshTaskState();
      await recoveryQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复任务失败。");
    },
  });

  const resumeAllMutation = useMutation({
    mutationFn: resumeAllRecoveryCandidates,
    onSuccess: async (response) => {
      const resumedCount = response.data?.resumed.length ?? 0;
      toast.success(resumedCount > 0 ? `已恢复 ${resumedCount} 个任务。` : "当前没有可恢复任务。");
      await refreshTaskState();
      await recoveryQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "批量恢复任务失败。");
    },
  });

  const busyTaskId = useMemo(() => {
    if (!resumeSingleMutation.isPending) {
      return "";
    }
    return resumeSingleMutation.variables?.id ?? "";
  }, [resumeSingleMutation.isPending, resumeSingleMutation.variables]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setDismissed(true); }}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>检测到待恢复任务</DialogTitle>
          <DialogDescription>
            系统启动时发现有后台任务在服务重启前中断了。现在不会自动继续执行，你可以先逐个确认，再决定是否恢复。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatTaskKind(item.kind)}</Badge>
                      <Badge variant={item.status === "running" ? "default" : "secondary"}>
                        {item.status === "running" ? "运行中断" : "排队中断"}
                      </Badge>
                    </div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">所属对象：{item.ownerLabel}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => resumeSingleMutation.mutate({ kind: item.kind, id: item.id })}
                      disabled={resumeAllMutation.isPending || (resumeSingleMutation.isPending && busyTaskId !== item.id)}
                    >
                      {resumeSingleMutation.isPending && busyTaskId === item.id ? "恢复中..." : "继续单个"}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={item.sourceRoute} onClick={() => setDismissed(true)}>打开任务位置</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground">
                  {item.currentStage ? <div>当前阶段：{item.currentStage}</div> : null}
                  {item.currentItemLabel ? <div>中断位置：{item.currentItemLabel}</div> : null}
                  {item.resumeAction ? <div>建议动作：{item.resumeAction}</div> : null}
                  {item.recoveryHint ? <div>恢复建议：{item.recoveryHint}</div> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setDismissed(true)}>
            稍后处理
          </Button>
          <Button onClick={() => resumeAllMutation.mutate()} disabled={resumeSingleMutation.isPending || resumeAllMutation.isPending}>
            {resumeAllMutation.isPending ? "恢复全部中..." : "继续全部"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
