import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { listTasks } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(value: string | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

export default function Home() {
  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.list("home"),
    queryFn: () => listTasks({ limit: 80 }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => item.status === "queued" || item.status === "running") ? 4000 : false;
    },
  });

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 5),
    queryFn: () => getNovelList({ page: 1, limit: 5 }),
  });

  const tasks = taskQuery.data?.data?.items ?? [];
  const novels = novelQuery.data?.data?.items ?? [];

  const runningCount = useMemo(
    () => tasks.filter((item) => item.status === "running").length,
    [tasks],
  );
  const failedCount = useMemo(
    () => tasks.filter((item) => item.status === "failed").length,
    [tasks],
  );
  const completed24hCount = useMemo(
    () =>
      tasks.filter((item) => {
        if (item.status !== "succeeded") {
          return false;
        }
        const updatedAt = new Date(item.updatedAt).getTime();
        if (Number.isNaN(updatedAt)) {
          return false;
        }
        return Date.now() - updatedAt <= 24 * 60 * 60 * 1000;
      }).length,
    [tasks],
  );
  const recentNovel = novels[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>运行中任务</CardDescription>
            <CardTitle className="text-2xl">{runningCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>失败任务</CardDescription>
            <CardTitle className="text-2xl">{failedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>24h 完成</CardDescription>
            <CardTitle className="text-2xl">{completed24hCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>最近编辑小说</CardDescription>
            <CardTitle className="text-base">{recentNovel?.title ?? "暂无"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
          <CardDescription>从首页直接进入高频入口。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/novels">新建小说</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/book-analysis">新建拆书</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/tasks">打开任务中心</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近项目</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {novels.map((novel) => (
            <div key={novel.id} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{novel.title}</div>
              <div className="text-xs text-muted-foreground">
                更新时间：{formatDate(novel.updatedAt)}
              </div>
            </div>
          ))}
          {novels.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              暂无小说项目，先从“新建小说”开始。
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
