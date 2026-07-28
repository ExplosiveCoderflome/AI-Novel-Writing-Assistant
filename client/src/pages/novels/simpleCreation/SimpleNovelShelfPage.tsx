import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, Download, Loader2, Settings2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SimpleCreationShelfChapterStatus } from "@ai-novel/shared/types/novel";
import {
  convertNovelToProfessional,
  downloadNovelExport,
  getSimpleCreationShelf,
} from "@/api/novel";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import SimpleCreationMaterialsPanel from "./SimpleCreationMaterialsPanel";
import OnboardingTip from "@/components/onboarding/OnboardingTip";

const STATUS_LABELS: Record<SimpleCreationShelfChapterStatus, string> = {
  waiting_planning: "等待规划",
  waiting_writing: "等待写作",
  generating: "生成中",
  reviewing: "审校修复中",
  completed: "已完成",
  error: "异常",
};

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function SimpleNovelShelfPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const shelfQuery = useQuery({
    queryKey: ["novels", id, "simple-shelf"],
    queryFn: () => getSimpleCreationShelf(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.progress.status;
      return status === "running" || status === "queued" ? 3000 : 10000;
    },
  });
  const shelf = shelfQuery.data?.data ?? null;
  const readableChapters = useMemo(
    () => shelf?.chapters.filter((chapter) => chapter.status === "completed" && chapter.content) ?? [],
    [shelf?.chapters],
  );
  const selectedChapter = useMemo(
    () => readableChapters.find((chapter) => chapter.id === selectedChapterId)
      ?? readableChapters.at(-1)
      ?? null,
    [readableChapters, selectedChapterId],
  );

  useEffect(() => {
    if (selectedChapter && selectedChapter.id !== selectedChapterId) {
      setSelectedChapterId(selectedChapter.id);
    }
  }, [selectedChapter, selectedChapterId]);

  useEffect(() => {
    if (shelf?.novel.creationExperience === "professional") {
      navigate(`/novels/${id}/edit`, { replace: true });
    }
  }, [id, navigate, shelf?.novel.creationExperience]);

  const exportMutation = useMutation({
    mutationFn: () => downloadNovelExport(id, "txt", "chapter", shelf?.novel.title),
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
    onError: () => toast.error("导出失败，请稍后重试。"),
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const task = await getActiveAutoDirectorTask(id);
      if (!task.data?.id) {
        throw new Error("没有找到可恢复的 AI 任务。");
      }
      return continueNovelWorkflow(task.data.id);
    },
    onSuccess: async () => {
      toast.success("AI 已按当前作品继续处理。");
      await queryClient.invalidateQueries({ queryKey: ["novels", id, "simple-shelf"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "恢复失败，请重试。"),
  });

  const convertMutation = useMutation({
    mutationFn: () => convertNovelToProfessional(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["novels", id] });
      navigate(`/novels/${id}/edit`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "转换失败，请重试。"),
  });

  if (shelfQuery.isPending || !shelf) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在打开章节书架</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-0">
      <header className="rounded-2xl border border-border bg-background p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="px-0"><Link to="/novels"><ArrowLeft className="h-4 w-4" /> 返回小说列表</Link></Button>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">{shelf.novel.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">简易创作 · 只读</Badge>
              <span>已完成 {shelf.progress.completedChapters}/{shelf.progress.totalChapters || "待规划"} 章</span>
              <span>{shelf.progress.currentAction}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LiveExecutionDialog
              taskId={shelf.progress.directorTaskId}
              autoOpenOnActivity
            />
            {shelf.progress.canRetry ? (
              <Button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 按 AI 建议继续
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Download className="h-4 w-4" /> 导出已完成章节
            </Button>
            <Button variant="ghost" onClick={() => setConvertOpen(true)}><Settings2 className="h-4 w-4" /> 转为专业创作</Button>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${shelf.progress.percent}%` }} />
        </div>
        {shelf.progress.safetyMessage ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div><div className="font-medium text-foreground">AI 已暂停以保护作品</div><div className="text-muted-foreground">{shelf.progress.safetyMessage}</div></div>
          </div>
        ) : null}
      </header>

      <OnboardingTip
        storageKey="simple-creation-shelf"
        title="只阅读已完成的稳定正文"
        description="生成中的章节会经历写作、审校和修复，完成前不会提前展示。你可以离开页面，后台任务仍会继续。"
        next="第一章完成后，书架会自动突出最新成稿。"
      />

      <SimpleCreationMaterialsPanel materials={shelf.materials} />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-background p-4 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto">
          <div className="mb-3 font-medium text-foreground">实时章节书架</div>
          <div className="space-y-2">
            {shelf.chapters.length === 0 ? <div className="rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">AI 正在准备全书规划，第一批章节出现后会自动显示在这里。</div> : null}
            {shelf.chapters.map((chapter) => {
              const readable = chapter.status === "completed" && Boolean(chapter.content);
              const active = selectedChapter?.id === chapter.id;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  disabled={!readable}
                  onClick={() => setSelectedChapterId(chapter.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-background"} ${readable ? "hover:border-primary/40" : "cursor-default opacity-75"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-xs text-muted-foreground">第 {chapter.order} 章</div><div className="mt-1 truncate text-sm font-medium text-foreground">{chapter.title || "等待命名"}</div></div>
                    <Badge variant={chapter.status === "completed" ? "outline" : chapter.status === "error" ? "destructive" : "secondary"}>{STATUS_LABELS[chapter.status]}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            待跟进质量项 {shelf.materials.openQualityDebtCount} 条。普通质量问题由 AI 继续处理，不会打断全书生产。
          </div>
        </aside>

        <main className="min-h-[560px] rounded-2xl border border-border bg-background">
          {selectedChapter?.content ? (
            <>
              <div className="border-b border-border px-5 py-4"><div className="text-xs text-muted-foreground">第 {selectedChapter.order} 章</div><h2 className="mt-1 text-xl font-semibold text-foreground">{selectedChapter.title}</h2></div>
              <article className="mx-auto max-w-3xl whitespace-pre-wrap px-5 py-7 text-base leading-8 text-foreground sm:px-8">{selectedChapter.content}</article>
            </>
          ) : (
            <div className="flex min-h-[560px] items-center justify-center px-6 text-center">
              <div className="max-w-md"><BookOpen className="mx-auto h-10 w-10 text-muted-foreground" /><div className="mt-4 text-lg font-medium text-foreground">章节正在路上</div><p className="mt-2 text-sm leading-6 text-muted-foreground">AI 会先完成规划，再逐章写作、审校和修复。完成后的章节会自动出现在左侧书架。</p></div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转为专业创作？</DialogTitle>
            <DialogDescription>转换后可编辑设定、规划和章节正文，现有内容与后台任务都会保留。此操作不能切回简易创作。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConvertOpen(false)}>继续使用简易创作</Button><Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>{convertMutation.isPending ? "转换中..." : "确认转为专业创作"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
