import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listTasks } from "@/api/tasks";
import { listAutoDirectorFollowUps } from "@/api/autoDirectorFollowUps";
import { Button } from "@/components/ui/button";
import type { UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { getNovelEditHref } from "@/lib/novelRoutes";
import { formatStatus, getTaskQueueLevelLabel } from "@/pages/tasks/taskCenterUtils";

function formatMobileTaskStatus(task: UnifiedTaskSummary): string {
  const queueLabel = getTaskQueueLevelLabel(task);
  return queueLabel === "普通任务" ? formatStatus(task.status) : queueLabel;
}

export function MobileRecords() {
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({ queryKey: ["mobileRecords", cursor], queryFn: () => listTasks({ limit: 30, cursor }), refetchInterval: 5000 });
  const data = query.data?.data;
  return <section className="space-y-4"><h1 className="text-xl font-semibold">运行记录</h1>
    <p className="text-sm text-muted-foreground">查看状态，打开对应小说或来源页面处理任务。</p>
    {query.isError ? <p role="alert">记录读取失败。<Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></p> : null}
    <div className="divide-y">{data?.items.map(task => <article key={`${task.kind}:${task.id}`} className="space-y-2 py-4">
      <h2 className="font-medium">{task.title}</h2><p className="text-sm">{formatMobileTaskStatus(task)} · {Math.round(task.progress <= 1 ? task.progress * 100 : task.progress)}%</p>
      <p className="text-sm text-muted-foreground">{task.currentItemLabel ?? task.currentStage}</p>
      {task.lastError ? <p className="text-sm text-destructive">{task.lastError}</p> : null}
      <Button asChild variant="outline" size="sm"><Link to={task.sourceRoute}>打开来源页面</Link></Button>
    </article>)}</div>
    {data && !data.items.length ? <p className="text-sm text-muted-foreground">暂无运行记录。</p> : null}
    {data?.nextCursor ? <Button variant="outline" onClick={() => setCursor(data.nextCursor!)}>下一页</Button> : null}
    {cursor ? <Button variant="ghost" onClick={() => setCursor(undefined)}>返回最新记录</Button> : null}
  </section>;
}

export function MobileNotifications() {
  const query = useQuery({ queryKey: ["mobileNotifications"], queryFn: () => listAutoDirectorFollowUps({ page: 1, pageSize: 50 }), refetchInterval: 10000 });
  return <section className="space-y-4"><h1 className="text-xl font-semibold">通知与跟进</h1>
    {query.isError ? <p role="alert">通知读取失败。<Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></p> : null}
    <div className="divide-y">{query.data?.data?.items.map(item => <article className="space-y-2 py-4" key={`${item.itemType}:${item.directorTaskId}:${item.autoApprovalRecordId ?? ""}`}>
      <h2 className="font-medium">{item.novelTitle || item.taskTitle}</h2><p className="text-sm">{item.reasonLabel}</p><p className="text-sm text-muted-foreground">{item.followUpSummary}</p>
      {item.novelId ? <Button asChild size="sm" variant="outline"><Link to={getNovelEditHref(item.novelId)}>打开小说</Link></Button> : <p className="text-sm text-muted-foreground">请在电脑端查看开书结果。</p>}
    </article>)}</div>
    {query.data?.data?.items.length === 0 ? <p className="text-sm text-muted-foreground">暂无需要跟进的通知。</p> : null}
  </section>;
}
