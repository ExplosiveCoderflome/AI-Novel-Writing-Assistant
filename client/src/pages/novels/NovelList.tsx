import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createNovel, deleteNovel, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";

type StatusFilter = "all" | "draft" | "published";

export default function NovelList() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
  });

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
  });

  const createNovelMutation = useMutation({
    mutationFn: () =>
      createNovel({
        title: form.title,
        description: form.description,
      }),
    onSuccess: async () => {
      setForm({ title: "", description: "" });
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
    },
  });

  const deleteNovelMutation = useMutation({
    mutationFn: (id: string) => deleteNovel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
    },
  });

  const novels = useMemo(() => {
    const items = novelListQuery.data?.data?.items ?? [];
    if (status === "all") {
      return items;
    }
    return items.filter((item) => item.status === status);
  }, [novelListQuery.data?.data?.items, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={status === "all" ? "default" : "secondary"}
            onClick={() => setStatus("all")}
          >
            全部
          </Button>
          <Button
            variant={status === "draft" ? "default" : "secondary"}
            onClick={() => setStatus("draft")}
          >
            草稿
          </Button>
          <Button
            variant={status === "published" ? "default" : "secondary"}
            onClick={() => setStatus("published")}
          >
            已发布
          </Button>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>创建新小说</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建小说</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="请输入小说标题"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                placeholder="请输入小说简介（可选）"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <Button
                className="w-full"
                onClick={() => createNovelMutation.mutate()}
                disabled={createNovelMutation.isPending || !form.title.trim()}
              >
                {createNovelMutation.isPending ? "创建中..." : "确认创建"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {novels.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>暂无小说</CardTitle>
            <CardDescription>点击右上角“创建新小说”开始创作。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {novels.map((novel) => (
            <Card key={novel.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="line-clamp-1 text-lg">{novel.title}</CardTitle>
                  <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                    {novel.status === "published" ? "已发布" : "草稿"}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">
                  {novel.description || "暂无简介"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  章节数：{novel._count.chapters}，角色数：{novel._count.characters}
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link to={`/novels/${novel.id}/edit`}>编辑</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => deleteNovelMutation.mutate(novel.id)}
                    disabled={deleteNovelMutation.isPending}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
