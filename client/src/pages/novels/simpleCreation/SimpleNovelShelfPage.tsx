import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  PauseCircle,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SimpleCreationShelfChapterStatus } from "@ai-novel/shared/types/novel";
import {
  downloadNovelExport,
  getSimpleCreationShelf,
  setNovelCreationExperience,
} from "@/api/novel";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import SimpleCreationMaterialsPanel from "./SimpleCreationMaterialsPanel";
import OnboardingTip from "@/components/onboarding/OnboardingTip";
import SimpleCreationIssueGovernancePanel from "./SimpleCreationIssueGovernancePanel";

const STATUS_LABELS: Record<SimpleCreationShelfChapterStatus, string> = {
  waiting_planning: "等待规划",
  waiting_writing: "等待写作",
  generating: "生成中",
  reviewing: "审校修复中",
  quality_debt: "已保存 · 待优化",
  replan_required: "等待重规划",
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

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "更新时间未知"
    : `更新于 ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatWordCount(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString()} 字`;
}

export default function SimpleNovelShelfPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState("");

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
    () => shelf?.chapters.filter((chapter) => Boolean(chapter.content?.trim())) ?? [],
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
      const directorTaskId = shelf?.progress.directorTaskId;
      if (!directorTaskId) {
        throw new Error("没有找到可恢复的 AI 任务。");
      }
      // 书架已投影出本书最近的自动导演任务。重规划检查点会将任务标记为
      // failed，因此不能再用“仅运行中任务”的查询覆盖这个恢复锚点。
      return continueNovelWorkflow(directorTaskId, { continuationMode: "auto_execute_range" });
    },
    onSuccess: async () => {
      toast.success(shelf?.progress.recoveryAction === "replan_and_continue"
        ? "AI 正在保留已有正文、重规划后续章节并继续创作。"
        : "AI 正在整理后续内容并继续创作。");
      await queryClient.invalidateQueries({ queryKey: ["novels", id, "simple-shelf"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "恢复失败，请重试。"),
  });

  const switchExperienceMutation = useMutation({
    mutationFn: () => setNovelCreationExperience(id, "professional"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["novels", id] });
      navigate(`/novels/${id}/edit`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "切换模式失败，请重试。"),
  });

  if (shelfQuery.isPending || !shelf) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在打开章节书架</div>;
  }

  const savedDraftCount = readableChapters.length;
  const stableChapterCount = shelf.progress.completedChapters;
  const totalChapterCount = shelf.progress.totalChapters || shelf.chapters.length;

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-[1480px] space-y-4 px-3 py-4 sm:px-5 lg:px-8">
        <header className="overflow-hidden rounded-3xl border border-border bg-background shadow-sm">
          <div className="bg-muted/[0.28] px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <Button variant="ghost" size="sm" asChild className="-ml-2 px-2 text-muted-foreground hover:bg-background hover:text-foreground">
                  <Link to="/novels"><ArrowLeft className="h-4 w-4" /> 返回小说列表</Link>
                </Button>
                <div className="mt-4 flex items-start gap-3">
                  <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 sm:flex">
                    <BookOpenText className="h-6 w-6 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{shelf.novel.title}</h1>
                      <Badge variant="outline">简易模式 · 只读</Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">这里是这本书的阅读台。AI 会在后台继续规划、写作和审校，你可以随时查看已经保存的正文。</p>
                  </div>
                </div>
              </div>

              <div className="w-full rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm xl:max-w-sm">
                <div className="flex items-center justify-between gap-3 text-sm text-foreground">
                  <span className="text-muted-foreground">全书生产进度</span>
                  <span className="font-semibold">{shelf.progress.percent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${shelf.progress.percent}%` }} />
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  {shelf.progress.status === "paused" || shelf.progress.status === "failed" ? <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  <span>{shelf.progress.currentAction}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x border-t border-border sm:grid-cols-4">
            <div className="p-4 sm:px-6"><div className="text-xs text-muted-foreground">稳定成稿</div><div className="mt-1 text-xl font-semibold text-foreground">{stableChapterCount}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {totalChapterCount || "—"} 章</span></div></div>
            <div className="p-4 sm:px-6"><div className="text-xs text-muted-foreground">已保存正文</div><div className="mt-1 text-xl font-semibold text-foreground">{savedDraftCount}<span className="ml-1 text-sm font-normal text-muted-foreground">章可阅读</span></div></div>
            <div className="p-4 sm:px-6"><div className="text-xs text-muted-foreground">当前任务</div><div className="mt-1 truncate text-sm font-medium text-foreground">{shelf.progress.status === "paused" ? "已暂停，等待恢复" : shelf.progress.currentAction}</div></div>
            <div className="p-4 sm:px-6"><div className="text-xs text-muted-foreground">待跟进质量项</div><div className="mt-1 text-xl font-semibold text-foreground">{shelf.materials.openQualityDebtCount}<span className="ml-1 text-sm font-normal text-muted-foreground">条</span></div></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-5 py-3 sm:px-7">
            {shelf.progress.directorTaskId ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/novels/auto-director?taskId=${encodeURIComponent(shelf.progress.directorTaskId)}`}>查看 AI 导演进度</Link>
              </Button>
            ) : null}
            {shelf.progress.canRetry ? (
              <Button size="sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {shelf.progress.recoveryAction === "replan_and_continue" ? "重规划后继续" : "继续创作"}
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}><Download className="h-4 w-4" /> 导出已完成章节</Button>
            <Button variant="ghost" size="sm" onClick={() => switchExperienceMutation.mutate()} disabled={switchExperienceMutation.isPending}><Settings2 className="h-4 w-4" /> 专业模式</Button>
          </div>
          {shelf.progress.safetyMessage ? (
            <div className="flex items-start gap-3 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-950 sm:px-7">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
              <div><div className="font-medium">AI 已暂停以保护作品</div><div className="text-amber-900/75">{shelf.progress.safetyMessage}</div></div>
            </div>
          ) : null}
        </header>

        <OnboardingTip
          storageKey="simple-creation-shelf"
          title="阅读已保存正文"
          description="已经保存的正文会及时出现在书架；审校或修复中的章节仍可能更新，完成后会成为稳定成稿。"
          next="选择左侧章节即可阅读当前版本。"
        />

        <SimpleCreationIssueGovernancePanel
          novelId={id}
          directorTaskId={shelf.progress.directorTaskId}
        />
        <SimpleCreationMaterialsPanel materials={shelf.materials} />

        <section className="flex min-h-[650px] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-sm lg:sticky lg:top-4 lg:h-[calc(100dvh-6rem)] lg:min-h-[560px]">
          <div className="flex shrink-0 flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
              <div><div className="font-semibold text-foreground">正文阅读台</div><div className="text-xs text-muted-foreground">选择章节后在右侧阅读当前保存版本</div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground">{savedDraftCount} 章有正文 · {stableChapterCount} 章已稳定</div>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/novels/${id}/preview${selectedChapter ? `?chapterId=${encodeURIComponent(selectedChapter.id)}` : ""}`}>
                  <Eye className="h-4 w-4" /> 进入预览模式
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="min-h-0 border-b border-border bg-muted/20 p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between px-2 py-2">
                <div className="text-sm font-semibold text-foreground">章节目录</div>
                <Badge variant="secondary">{shelf.chapters.length} 章</Badge>
              </div>
              <div className="space-y-2 pr-1">
                {shelf.chapters.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm leading-6 text-muted-foreground">AI 正在准备全书规划，第一批章节出现后会自动显示在这里。</div> : null}
                {shelf.chapters.map((chapter) => {
                  const readable = Boolean(chapter.content?.trim());
                  const active = selectedChapter?.id === chapter.id;
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      disabled={!readable}
                      onClick={() => setSelectedChapterId(chapter.id)}
                      className={`group w-full rounded-2xl border p-3 text-left transition ${active ? "border-primary bg-primary/10 shadow-sm" : "border-border/70 bg-background hover:border-primary/40 hover:bg-primary/[0.03]"} ${readable ? "" : "cursor-default opacity-60"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          {chapter.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{chapter.title || "等待命名"}</span>
                            <Badge className={`shrink-0 ${chapter.status === "quality_debt" ? "border-amber-200 bg-amber-50 text-amber-800" : ""}`} variant={chapter.status === "completed" ? "outline" : chapter.status === "replan_required" || chapter.status === "error" ? "destructive" : "secondary"}>{STATUS_LABELS[chapter.status]}</Badge>
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {readable ? chapter.status === "quality_debt" ? <><AlertTriangle className="h-3 w-3 text-amber-600" /> {formatWordCount(chapter.wordCount)}</> : <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {formatWordCount(chapter.wordCount)}</> : <><Clock3 className="h-3 w-3" /> 等待正文</>}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                普通质量问题会作为待跟进事项记录，不会打断全书生产。
              </div>
            </aside>

            <main className="min-w-0 bg-background lg:min-h-0 lg:overflow-y-auto">
              {selectedChapter?.content ? (
                <>
                  <div className="border-b border-border/80 bg-background px-5 py-5 sm:px-8 lg:sticky lg:top-0 lg:z-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground">第 {selectedChapter.order} 章</span>
                      <Badge className={selectedChapter.status === "quality_debt" ? "border-amber-200 bg-amber-50 text-amber-800" : ""} variant={selectedChapter.status === "completed" ? "outline" : selectedChapter.status === "replan_required" || selectedChapter.status === "error" ? "destructive" : "secondary"}>{STATUS_LABELS[selectedChapter.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{formatWordCount(selectedChapter.wordCount)} · {formatUpdatedAt(selectedChapter.updatedAt)}</span>
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selectedChapter.title}</h2>
                    {selectedChapter.status === "quality_debt" ? (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>正文已安全保存。本章有待回收的局部质量项，但不会阻断后续创作。</span>
                      </div>
                    ) : selectedChapter.status === "replan_required" ? (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>本章与相邻章节的安排需要 AI 先重规划，正文会被保留。</span>
                      </div>
                    ) : selectedChapter.status !== "completed" ? (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                        <span>当前显示的是已保存版本，AI 完成审校或修复后可能会更新。</span>
                      </div>
                    ) : null}
                  </div>
                  <article className="mx-auto max-w-3xl px-5 py-8 pb-20 text-[16px] leading-8 text-foreground sm:px-10 sm:py-10 sm:pb-24 lg:px-14">
                    <div className="whitespace-pre-wrap">{selectedChapter.content}</div>
                  </article>
                </>
              ) : (
                <div className="flex min-h-full items-center justify-center px-6 py-20 text-center">
                  <div className="max-w-md">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm"><BookOpen className="h-7 w-7" /></span>
                    <div className="mt-5 text-lg font-semibold text-foreground">选择一个有正文的章节</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">章节完成写作后会出现在左侧目录。审校中的章节也可以提前阅读当前保存版本。</p>
                  </div>
                </div>
              )}
            </main>
          </div>
        </section>

      </div>
    </div>
  );
}
