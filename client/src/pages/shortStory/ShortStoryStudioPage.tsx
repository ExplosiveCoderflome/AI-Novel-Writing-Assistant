import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileText,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ShortStoryRevisionImpact } from "@ai-novel/shared/types/creationStudio";
import {
  applyShortStoryRevision,
  deriveShortStoryLongForm,
  getShortStory,
  previewShortStoryRevision,
  retryShortStoryProduction,
  updateShortStorySegment,
} from "@/api/creationStudio";
import { downloadNovelExport } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

export default function ShortStoryStudioPage() {
  const novelId = useParams<{ id: string }>().id ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionImpact, setRevisionImpact] = useState<ShortStoryRevisionImpact | null>(null);

  const storyQuery = useQuery({
    queryKey: ["short-story", novelId],
    queryFn: () => getShortStory(novelId),
    enabled: Boolean(novelId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.production.status;
      return status === "queued" || status === "running" ? 1800 : false;
    },
  });
  const story = storyQuery.data?.data ?? null;
  const isProducing = story?.production.status === "queued" || story?.production.status === "running";

  useEffect(() => {
    if (!story || editing) return;
    setDrafts(Object.fromEntries(story.segments.map((segment) => [segment.id, segment.content])));
  }, [story, editing]);

  const changedSegments = useMemo(() => {
    if (!story) return [];
    return story.segments.filter((segment) => (drafts[segment.id] ?? segment.content) !== segment.content);
  }, [drafts, story]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!story) return;
      for (const segment of changedSegments) {
        await updateShortStorySegment(novelId, segment.id, {
          content: drafts[segment.id] ?? segment.content,
          expectedVersion: segment.version,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["short-story", novelId] });
      setEditing(false);
      toast.success("正文已保存，并保留了修改前快照。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败，请刷新后重试。"),
  });

  const revisionPreviewMutation = useMutation({
    mutationFn: () => previewShortStoryRevision(novelId, { instruction: revisionInstruction.trim() }),
    onSuccess: (response) => {
      setRevisionImpact(response.data ?? null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "暂时无法理解这次修改。"),
  });

  const revisionApplyMutation = useMutation({
    mutationFn: () => {
      if (!revisionImpact) throw new Error("修改预览已失效。");
      return applyShortStoryRevision(novelId, revisionImpact.intentVersionId);
    },
    onSuccess: async () => {
      setRevisionImpact(null);
      setRevisionInstruction("");
      await queryClient.invalidateQueries({ queryKey: ["short-story", novelId] });
      toast.success("已开始按确认的范围修改作品。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "应用修改失败。"),
  });

  const exportMutation = useMutation({
    mutationFn: () => downloadNovelExport(novelId, "txt", "full", story?.novel.title),
    onSuccess: ({ blob, fileName }) => {
      createDownload(blob, fileName);
      toast.success("导出已开始。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "导出失败。"),
  });

  const deriveMutation = useMutation({
    mutationFn: () => deriveShortStoryLongForm(novelId),
    onSuccess: (response) => {
      if (response.data?.resumeRoute) navigate(response.data.resumeRoute);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "暂时无法发展成长篇。"),
  });

  const retryMutation = useMutation({
    mutationFn: () => retryShortStoryProduction(novelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["short-story", novelId] });
      toast.success("已从中断的位置继续生成。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "继续生成失败。"),
  });

  if (storyQuery.isLoading) {
    return <CenteredStatus label="正在打开作品…" />;
  }
  if (!story) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-semibold">作品暂时无法打开</h1>
        <p className="mt-2 text-sm text-muted-foreground">请返回作品列表后重试。</p>
        <Button asChild className="mt-5"><Link to="/novels">返回作品列表</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 bg-muted/15 p-3 sm:p-4 xl:p-5">
      <header className="mb-4 rounded-xl border bg-background px-4 py-3 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0 text-muted-foreground">
                <Link to="/novels"><ArrowLeft className="mr-1.5 h-4 w-4" />作品列表</Link>
              </Button>
              <span className="h-4 w-px bg-border" />
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{story.novel.title}</h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {story.intent?.understanding ?? "AI 正在整理这篇作品的创作方向。"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || !story.continuousContent}
            >
              <Download className="mr-2 h-4 w-4" />{exportMutation.isPending ? "导出中…" : "导出作品"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deriveMutation.mutate()}
              disabled={deriveMutation.isPending || isProducing}
            >
              <BookOpen className="mr-2 h-4 w-4" />{deriveMutation.isPending ? "准备中…" : "发展成长篇"}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="min-w-0 space-y-4">
          {isProducing ? (
            <Card className="border-primary/20 bg-primary/[0.03] shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate font-medium">{story.production.currentAction ?? "AI 正在写完整作品"}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(story.production.progress * 100)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(3, Math.round(story.production.progress * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {story.production.status === "failed" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-destructive">生成暂时中断</div>
                <p className="mt-1 break-words text-muted-foreground">{story.production.error ?? "可以从已保存的内容继续。"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                {retryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                继续生成
              </Button>
            </div>
          ) : null}

          <section className="min-w-0 overflow-hidden rounded-xl border bg-background shadow-sm">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-medium">{editing ? "编辑正文" : "完整成稿"}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {story.continuousContent.replace(/\s+/g, "").length.toLocaleString()} 字
                    {editing && changedSegments.length > 0 ? ` · ${changedSegments.length} 处未保存` : ""}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDrafts(Object.fromEntries(story.segments.map((segment) => [segment.id, segment.content])));
                        setEditing(false);
                      }}
                    >
                      取消
                    </Button>
                    <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || changedSegments.length === 0}>
                      {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      保存修改
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={isProducing || story.segments.length === 0}>
                    <PencilLine className="mr-2 h-4 w-4" />直接编辑
                  </Button>
                )}
              </div>
            </div>

            <article className="min-h-[calc(100vh-15rem)] px-5 py-7 sm:px-8 sm:py-9 xl:px-10 2xl:px-12">
              {story.segments.length === 0 ? (
                <div className="flex min-h-[45vh] items-center justify-center text-sm text-muted-foreground">
                  {isProducing ? "第一段正文完成后会显示在这里。" : "暂时还没有正文。"}
                </div>
              ) : editing ? (
                <div className="overflow-hidden rounded-lg border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                  {story.segments.map((segment) => (
                    <textarea
                      key={segment.id}
                      aria-label="作品正文"
                      value={drafts[segment.id] ?? segment.content}
                      onChange={(event) => setDrafts((current) => ({ ...current, [segment.id]: event.target.value }))}
                      className="block w-full resize-none border-0 bg-transparent px-5 py-3 text-[16px] leading-8 outline-none first:pt-6 last:pb-6"
                      style={{ minHeight: `${Math.max(180, Math.ceil((drafts[segment.id] ?? segment.content).length / 42) * 32)}px` }}
                    />
                  ))}
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-[16px] leading-8 text-foreground selection:bg-primary/15">
                  {story.continuousContent || "正文仍在生成中。"}
                </div>
              )}
            </article>
          </section>
        </main>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="border-primary/15 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <WandSparkles className="h-4 w-4 text-primary" />
                  用一句话修改作品
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">先预览影响范围，确认后 AI 才会修改正文。</p>
              </div>
              <textarea
                value={revisionInstruction}
                onChange={(event) => {
                  setRevisionInstruction(event.target.value);
                  setRevisionImpact(null);
                }}
                placeholder="例如：让结尾更温暖，但保留主角最后的选择。"
                className="min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                disabled={isProducing}
              />
              <Button
                className="w-full"
                onClick={() => revisionPreviewMutation.mutate()}
                disabled={!revisionInstruction.trim() || revisionPreviewMutation.isPending || isProducing}
              >
                {revisionPreviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                预览修改范围
              </Button>

              {revisionImpact ? (
                <RevisionPreview
                  impact={revisionImpact}
                  applying={revisionApplyMutation.isPending}
                  onCancel={() => setRevisionImpact(null)}
                  onConfirm={() => revisionApplyMutation.mutate()}
                />
              ) : null}
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-background px-4 py-3 text-sm shadow-sm">
            <summary className="cursor-pointer font-medium">作品方向与优化建议</summary>
            <div className="mt-4 space-y-4 border-t pt-4 text-muted-foreground">
              <div>
                <div className="text-xs font-medium text-foreground">创作方向</div>
                <p className="mt-1.5 leading-6">{story.intent?.direction.premise ?? "暂未生成"}</p>
              </div>
              {story.plan?.qualityDebt.length ? (
                <div>
                  <div className="text-xs font-medium text-foreground">可继续优化</div>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {story.plan.qualityDebt.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : (
                <p>没有待处理的普通质量建议。</p>
              )}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function RevisionPreview(props: {
  impact: ShortStoryRevisionImpact;
  applying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const impact = props.impact;
  const strategyLabel = impact.recommendedStrategy === "local_patch"
    ? "局部调整"
    : impact.recommendedStrategy === "rewrite_downstream"
      ? "从影响处向后调整"
      : "重新规划整篇";
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
      <div className="font-medium">AI 对修改的理解</div>
      <p className="mt-2 text-sm leading-6">{impact.understoodGoal}</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <PreviewFact label="建议方式" value={strategyLabel} />
        <PreviewFact label="影响范围" value={`${impact.affectedSegmentIds.length} 个正文区域`} />
        <PreviewFact label="结尾" value={impact.changesEnding ? "会改变" : "保持"} />
        <PreviewFact label="核心意图" value={impact.changesCoreIntent ? "会改变" : "保持"} />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{impact.summary}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onCancel} disabled={props.applying}>先不修改</Button>
        <Button onClick={props.onConfirm} disabled={props.applying}>
          {props.applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          确认并应用
        </Button>
      </div>
    </div>
  );
}

function PreviewFact(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 font-medium">{props.value}</div>
    </div>
  );
}

function CenteredStatus({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
