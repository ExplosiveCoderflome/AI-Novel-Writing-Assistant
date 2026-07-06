import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Trash2 } from "lucide-react";
import { buildTitleLibraryListKey, deleteTitleLibraryEntry, listTitleLibrary, markTitleLibraryUsed } from "@/api/title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { truncateText } from "../titleStudio.shared";

interface TitleLibraryPanelProps {
  genreOptions: Array<{ id: string; label: string; path: string }>;
}

const controlClassName = "h-11 rounded-lg border-0 bg-muted/35 ring-1 ring-transparent transition hover:bg-muted/50 focus-visible:ring-primary/25";
const selectClassName = "w-full rounded-lg border-0 bg-muted/35 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition hover:bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary/25";

export default function TitleLibraryPanel({ genreOptions }: TitleLibraryPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [genreId, setGenreId] = useState("");
  const [sort, setSort] = useState<"newest" | "hot" | "clickRate">("newest");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [genreId, search, sort]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 18,
      search,
      genreId,
      sort,
    }),
    [genreId, page, search, sort],
  );
  const listKey = useMemo(() => buildTitleLibraryListKey(listParams), [listParams]);

  const libraryQuery = useQuery({
    queryKey: queryKeys.titles.list(listKey),
    queryFn: () => listTitleLibrary(listParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTitleLibraryEntry(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("标题已删除。");
    },
  });

  const markUsedMutation = useMutation({
    mutationFn: (id: string) => markTitleLibraryUsed(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("标题使用次数已更新。");
    },
  });

  const handleCopy = async (title: string) => {
    await navigator.clipboard.writeText(title);
    toast.success("标题已复制到剪贴板。");
  };

  const rows = libraryQuery.data?.data?.items ?? [];
  const pagination = libraryQuery.data?.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 border-b border-border/60 pb-5 md:grid-cols-[minmax(0,1fr)_220px_180px]">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">搜索</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="匹配标题、说明或关键词"
            className={controlClassName}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">类型</span>
          <select
            className={selectClassName}
            value={genreId}
            onChange={(event) => setGenreId(event.target.value)}
          >
            <option value="">全部类型</option>
            {genreOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.path}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">排序</span>
          <select
            className={selectClassName}
            value={sort}
            onChange={(event) => setSort(event.target.value as "newest" | "hot" | "clickRate")}
          >
            <option value="newest">最新加入</option>
            <option value="hot">使用次数</option>
            <option value="clickRate">点击潜力</option>
          </select>
        </label>
      </div>

      {libraryQuery.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          正在加载标题库...
        </div>
      ) : null}

      {!libraryQuery.isLoading && rows.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-sm font-medium text-foreground">标题库还是空的</div>
          <div className="mt-1 text-sm text-muted-foreground">
            先去标题工坊生成一批候选，再把值得复用的标题沉淀进来。
          </div>
        </div>
      ) : null}

      <div className="divide-y divide-border/55">
        {rows.map((entry) => (
          <div key={entry.id} className="group py-4 transition hover:bg-muted/[0.18]">
            <div className="grid gap-3 px-2 lg:grid-cols-[64px_minmax(0,1fr)_auto] lg:items-start">
              <div className="text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">预估</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {typeof entry.clickRate === "number" ? entry.clickRate : "-"}
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {entry.genre?.name ? <span>{entry.genre.name}</span> : null}
                  <span>使用 {entry.usedCount}</span>
                  <span>{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="text-xl font-semibold tracking-normal text-foreground">{entry.title}</div>
                {entry.description ? (
                  <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {truncateText(entry.description, 180)}
                  </div>
                ) : null}
                {entry.keywords ? (
                  <div className="text-xs text-muted-foreground">{truncateText(entry.keywords, 140)}</div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button type="button" size="sm" className="gap-1.5" onClick={() => void handleCopy(entry.title)}>
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={markUsedMutation.isPending && markUsedMutation.variables === entry.id}
                  onClick={() => markUsedMutation.mutate(entry.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {markUsedMutation.isPending && markUsedMutation.variables === entry.id ? "更新中" : "采用"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                  disabled={deleteMutation.isPending && deleteMutation.variables === entry.id}
                  onClick={() => {
                    const confirmed = window.confirm(`确认删除标题「${entry.title}」？`);
                    if (confirmed) {
                      deleteMutation.mutate(entry.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteMutation.isPending && deleteMutation.variables === entry.id ? "删除中" : "删除"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm">
          <div className="text-muted-foreground">
            第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
