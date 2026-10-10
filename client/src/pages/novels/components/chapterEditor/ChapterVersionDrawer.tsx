import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NovelChapterSnapshotListItem } from "@ai-novel/shared/types/novel";
import { getNovelChapterSnapshot, listNovelChapterSnapshots } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

interface ChapterVersionDrawerProps {
  novelId: string;
  chapterId: string;
  chapterTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContent: string;
  isDirty: boolean;
  onLoadContent: (content: string) => void;
}

function formatSnapshotDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTriggerLabel(snapshot: NovelChapterSnapshotListItem): string {
  if (snapshot.triggerType === "before_pipeline") return "自动生成前保存";
  if (snapshot.triggerType === "auto_milestone") return "自动节点保存";
  return snapshot.label || "手动保存版本";
}

export default function ChapterVersionDrawer(props: ChapterVersionDrawerProps) {
  const {
    novelId,
    chapterId,
    chapterTitle,
    open,
    onOpenChange,
    currentContent,
    isDirty,
    onLoadContent,
  } = props;
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const snapshotsQuery = useQuery({
    queryKey: queryKeys.novels.chapterSnapshots(novelId, chapterId),
    queryFn: () => listNovelChapterSnapshots(novelId, chapterId),
    enabled: open,
  });
  const snapshots = snapshotsQuery.data?.data ?? [];

  useEffect(() => {
    if (!open) {
      setSelectedSnapshotId(null);
      return;
    }
    if (!selectedSnapshotId || !snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) {
      setSelectedSnapshotId(snapshots[0]?.id ?? null);
    }
  }, [open, selectedSnapshotId, snapshots]);

  const snapshotQuery = useQuery({
    queryKey: [...queryKeys.novels.chapterSnapshots(novelId, chapterId), selectedSnapshotId ?? "none"],
    queryFn: () => getNovelChapterSnapshot(novelId, chapterId, selectedSnapshotId as string),
    enabled: open && Boolean(selectedSnapshotId),
  });
  const selectedSnapshot = snapshotQuery.data?.data ?? null;
  const selectedListItem = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [selectedSnapshotId, snapshots],
  );
  const currentLength = currentContent.length;

  const handleLoadContent = () => {
    if (!selectedSnapshot) return;
    if (isDirty && !window.confirm("当前正文还有未保存的修改，载入版本会替换编辑区内容。继续吗？")) {
      return;
    }
    onLoadContent(selectedSnapshot.content);
    onOpenChange(false);
    toast.success("版本已载入编辑区，保存后才会写入正文。");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[620px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 border-l bg-background p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12 text-left">
          <DialogTitle>本章版本</DialogTitle>
          <DialogDescription>
            查看「{chapterTitle}」保存过的正文，把合适的版本载入编辑区后再决定是否保存。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b bg-muted/10 p-3 md:border-b-0 md:border-r">
            {snapshotsQuery.isLoading ? (
              <div className="p-3 text-sm leading-6 text-muted-foreground">正在读取本章版本...</div>
            ) : snapshotsQuery.isError ? (
              <div className="p-3 text-sm leading-6 text-muted-foreground">版本读取失败，请稍后重试。</div>
            ) : snapshots.length === 0 ? (
              <div className="p-3 text-sm leading-6 text-muted-foreground">
                还没有包含本章正文的版本。接受 AI 修改或开始自动生成前，系统会自动留下可查看的版本。
              </div>
            ) : (
              <div className="space-y-1">
                {snapshots.map((snapshot) => {
                  const selected = snapshot.id === selectedSnapshotId;
                  return (
                    <button
                      key={snapshot.id}
                      type="button"
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
                      onClick={() => setSelectedSnapshotId(snapshot.id)}
                    >
                      <div className="truncate text-sm font-medium">{getTriggerLabel(snapshot)}</div>
                      <div className="mt-1 text-xs">{formatSnapshotDate(snapshot.createdAt)}</div>
                      <div className="mt-1 text-xs">{snapshot.contentLength.toLocaleString()} 字</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-5">
            {snapshotQuery.isLoading ? (
              <div className="text-sm leading-6 text-muted-foreground">正在读取版本正文...</div>
            ) : snapshotQuery.isError ? (
              <div className="text-sm leading-6 text-muted-foreground">这个版本暂时无法读取，请换一个版本。</div>
            ) : selectedSnapshot ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{selectedListItem ? getTriggerLabel(selectedListItem) : "版本正文"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatSnapshotDate(selectedSnapshot.createdAt)} · {selectedSnapshot.contentLength.toLocaleString()} 字
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    当前编辑区 {currentLength.toLocaleString()} 字
                  </span>
                </div>
                <div className="rounded-xl bg-muted/20 p-4">
                  <pre className="max-h-[calc(100dvh-260px)] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                    {selectedSnapshot.content || "（这个版本的正文为空）"}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-muted-foreground">选择左侧版本查看正文。</div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button type="button" disabled={!selectedSnapshot || snapshotQuery.isLoading} onClick={handleLoadContent}>
            载入编辑区
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
