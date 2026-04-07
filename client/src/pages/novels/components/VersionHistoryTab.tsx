import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNovelSnapshot, listNovelSnapshots, restoreNovelSnapshot } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VersionHistoryTabProps {
  novelId: string;
}

function formatSnapshotTrigger(triggerType: string): string {
  if (triggerType === "manual") {
    return "手动保存";
  }
  if (triggerType === "auto_milestone") {
    return "自动里程碑";
  }
  if (triggerType === "before_pipeline") {
    return "批量处理前";
  }
  return "版本快照";
}

function summarizeSnapshot(snapshotData: string): {
  chapterCount: number;
  writtenChapterCount: number;
  totalWordCount: number;
  latestChapterLabel: string;
  hasOutline: boolean;
  hasStructuredOutline: boolean;
  recentChapterTitles: string[];
} | null {
  try {
    const parsed = JSON.parse(snapshotData) as {
      outline?: string | null;
      structuredOutline?: string | null;
      chapters?: Array<{ title?: string | null; order?: number | null; content?: string | null }>;
    };
    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    const writtenChapters = chapters.filter((chapter) => Boolean(chapter.content?.trim()));
    const totalWordCount = writtenChapters.reduce((sum, chapter) => sum + (chapter.content?.trim().length ?? 0), 0);
    const latestChapter = [...chapters]
      .sort((left, right) => (right.order ?? 0) - (left.order ?? 0))[0];

    return {
      chapterCount: chapters.length,
      writtenChapterCount: writtenChapters.length,
      totalWordCount,
      latestChapterLabel: latestChapter
        ? `第 ${latestChapter.order ?? "?"} 章 · ${latestChapter.title?.trim() || "未命名章节"}`
        : "暂无章节",
      hasOutline: Boolean(parsed.outline?.trim()),
      hasStructuredOutline: Boolean(parsed.structuredOutline?.trim()),
      recentChapterTitles: chapters
        .slice(0, 3)
        .map((chapter) => chapter.title?.trim())
        .filter((title): title is string => Boolean(title)),
    };
  } catch {
    return null;
  }
}

export default function VersionHistoryTab({ novelId }: VersionHistoryTabProps) {
  const queryClient = useQueryClient();
  const snapshotsQuery = useQuery({
    queryKey: queryKeys.novels.snapshots(novelId),
    queryFn: () => listNovelSnapshots(novelId),
    enabled: Boolean(novelId),
  });

  const createMutation = useMutation({
    mutationFn: () => createNovelSnapshot(novelId, {
      triggerType: "manual",
      label: `manual-${new Date().toLocaleString()}`,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreNovelSnapshot(novelId, snapshotId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
  });

  const snapshots = snapshotsQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">版本历史</div>
          <div className="text-sm text-muted-foreground">
            这里优先帮你找回最近的稳定版本。恢复前系统会自动再备份一次当前状态，不再默认展示原始快照数据。
          </div>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "保存中..." : "保存当前版本"}
        </Button>
      </div>

      <div className="space-y-3">
        {snapshots.map((snapshot) => {
          const summary = summarizeSnapshot(snapshot.snapshotData);
          const isRestoringCurrent = restoreMutation.isPending && restoreMutation.variables === snapshot.id;

          return (
            <div key={snapshot.id} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="font-medium">{snapshot.label || "未命名版本"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatSnapshotTrigger(snapshot.triggerType)} · {new Date(snapshot.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{summary?.chapterCount ?? 0} 章</Badge>
                    <Badge variant="outline">{summary?.writtenChapterCount ?? 0} 章有正文</Badge>
                    <Badge variant="outline">{summary?.totalWordCount ?? 0} 字</Badge>
                    {summary?.hasOutline ? <Badge variant="secondary">含大纲</Badge> : null}
                    {summary?.hasStructuredOutline ? <Badge variant="secondary">含拆章</Badge> : null}
                  </div>

                  <div className="text-sm leading-6 text-muted-foreground">
                    {summary
                      ? `这个版本最近保存到了 ${summary.latestChapterLabel}，适合在你想退回到更稳定的章节推进状态时使用。`
                      : "这个版本的数据摘要暂时无法解析，但仍然可以恢复。"}
                  </div>

                  {summary?.recentChapterTitles.length ? (
                    <div className="text-xs text-muted-foreground">
                      包含章节：{summary.recentChapterTitles.join(" / ")}
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const confirmed = window.confirm("恢复前会自动备份当前状态。确认恢复这个版本吗？");
                    if (confirmed) {
                      restoreMutation.mutate(snapshot.id);
                    }
                  }}
                  disabled={restoreMutation.isPending}
                >
                  {isRestoringCurrent ? "恢复中..." : "恢复到这个版本"}
                </Button>
              </div>
            </div>
          );
        })}
        {snapshots.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            当前还没有版本记录。建议在大改方向、批量生成或大段重写前，先手动保存一个版本。
          </div>
        ) : null}
      </div>
    </div>
  );
}
