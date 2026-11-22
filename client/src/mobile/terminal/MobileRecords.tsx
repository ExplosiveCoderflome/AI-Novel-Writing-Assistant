import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getTaskDetail, listTasks } from "@/api/tasks";
import { listAutoDirectorFollowUps } from "@/api/autoDirectorFollowUps";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import type { TaskKind, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { getNovelEditHref } from "@/lib/novelRoutes";
import { formatStatus, getTaskQueueLevelLabel } from "@/pages/tasks/taskCenterUtils";

function formatMobileTaskStatus(task: UnifiedTaskSummary): string {
  const queueLabel = getTaskQueueLevelLabel(task);
  return queueLabel === "普通任务" ? formatStatus(task.status) : queueLabel;
}

function MobileRecord({ task }: { task: UnifiedTaskSummary }) {
  const percent = Math.round(task.progress <= 1 ? task.progress * 100 : task.progress);
  return (
    <article className="space-y-2 py-4">
      <h2 className="font-medium">{task.title}</h2>
      <p className="text-sm">{formatMobileTaskStatus(task)} · {percent}%</p>
      <p className="text-sm text-muted-foreground">{task.currentItemLabel ?? task.currentStage}</p>
      {task.lastError ? <p className="text-sm text-destructive">{task.lastError}</p> : null}
      <Button asChild variant="outline" size="sm"><Link to={task.sourceRoute}>打开来源页面</Link></Button>
    </article>
  );
}

function LinkedRecord({ kind, id }: { kind: TaskKind; id: string }) {
  const detail = useQuery({
    queryKey: queryKeys.tasks.detail(kind, id),
    queryFn: () => getTaskDetail(kind, id),
    retry: false,
    refetchInterval: query => {
      const status = query.state.data?.data?.status;
      return status === "running" || status === "queued" ? 5000 : false;
    },
  });
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">运行记录详情</h1>
      {detail.isLoading ? <p role="status">正在读取这条记录…</p> : null}
      {detail.isError ? <p role="alert">记录读取失败。<Button variant="ghost" onClick={() => void detail.refetch()}>重新读取</Button></p> : null}
      {detail.isSuccess && !detail.data.data ? <p role="status">找不到这条运行记录，请检查链接或查看其他记录。</p> : null}
      {detail.data?.data ? <MobileRecord task={detail.data.data} /> : null}
      <Button asChild variant="outline"><Link to="/tasks">查看全部运行记录</Link></Button>
    </section>
  );
}

export function MobileRecords() {
  const [params] = useSearchParams();
  const kind = params.get("kind") as TaskKind | null;
  const id = params.get("id");
  return kind && id ? <LinkedRecord kind={kind} id={id} /> : <MobileRecordList />;
}

function MobileRecordList() {
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({ queryKey: ["mobileRecords", cursor], queryFn: () => listTasks({ limit: 30, cursor }), refetchInterval: 5000 });
  const data = query.data?.data;
  return <section className="space-y-4"><h1 className="text-xl font-semibold">运行记录</h1>
    <p className="text-sm text-muted-foreground">查看状态，打开对应小说或来源页面处理任务。</p>
    {query.isError ? <p role="alert">记录读取失败。<Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></p> : null}
    <div className="divide-y">{data?.items.map(task => <MobileRecord key={`${task.kind}:${task.id}`} task={task} />)}</div>
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
