import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteNovel, downloadNovelExport, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";

type StatusFilter = "all" | "draft" | "published";
type WritingModeFilter = "all" | "original" | "continuation";

function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function NovelList() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [writingMode, setWritingMode] = useState<WritingModeFilter>("all");

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
  });

  const deleteNovelMutation = useMutation({
    mutationFn: (id: string) => deleteNovel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
    },
  });

  const downloadNovelMutation = useMutation({
    mutationFn: (novelId: string) => downloadNovelExport(novelId, "txt"),
    onSuccess: ({ blob, fileName }) => {
      createDownload(blob, fileName);
    },
  });

  const novels = useMemo(() => {
    const items = novelListQuery.data?.data?.items ?? [];
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) {
        return false;
      }
      if (writingMode !== "all" && item.writingMode !== writingMode) {
        return false;
      }
      return true;
    });
  }, [novelListQuery.data?.data?.items, status, writingMode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-2">
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={writingMode === "all" ? "default" : "secondary"}
              onClick={() => setWritingMode("all")}
            >
              创作类型: 全部
            </Button>
            <Button
              size="sm"
              variant={writingMode === "original" ? "default" : "secondary"}
              onClick={() => setWritingMode("original")}
            >
              原创
            </Button>
            <Button
              size="sm"
              variant={writingMode === "continuation" ? "default" : "secondary"}
              onClick={() => setWritingMode("continuation")}
            >
              续写
            </Button>
          </div>
        </div>

        <Button asChild>
          <Link to="/novels/create">创建新小说</Link>
        </Button>
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
                  <div className="flex items-center gap-2">
                    <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                      {novel.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                    {novel.writingMode === "continuation" ? (
                      <Badge variant="outline">续写</Badge>
                    ) : (
                      <Badge variant="outline">原创</Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="line-clamp-2">
                  {novel.description || "暂无简介"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  章节数：{novel._count.chapters}，角色数：{novel._count.characters}
                </div>
                {novel.world ? (
                  <div className="text-xs text-muted-foreground">
                    世界观：{novel.world.name}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link to={`/novels/${novel.id}/edit`}>编辑</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadNovelMutation.mutate(novel.id)}
                    disabled={downloadNovelMutation.isPending}
                  >
                    {downloadNovelMutation.isPending && downloadNovelMutation.variables === novel.id
                      ? "导出中..."
                      : "导出"}
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
