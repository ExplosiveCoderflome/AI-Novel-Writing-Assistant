import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronLeft,
  ChevronDown,
  Download,
  ImageOff,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  BookText,
  Palette,
  LayoutTemplate,
  Film,
  Hash,
  Users,
  Check,
  Play,
  RotateCcw,
  CircleDollarSign,
} from "lucide-react";
import {
  estimateBatchCost,
  exportComicEpisode,
  generateComicOutline,
  generateComicPanelScript,
  generatePanelImage,
  getBatchJob,
  getComicProject,
  importComicSourceBundle,
  listComicEpisodes,
  listComicPanels,
  panelImageUrl,
  retryBatchJob,
  startEpisodeBatch,
  updateComicPreset,
  type BatchProgress,
  type ComicBatchJob,
  type ComicEpisode,
  type ComicPanel,
  type ComicProject,
} from "@/api/comic";
import { COMIC_FORMATS } from "@/pages/comic/ComicWorkspacePage";
import { CharactersPanel } from "@/pages/comic/project/CharactersPanel";
import { getAPIKeySettings } from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseImageData(raw: string | null | undefined): { status?: string; url?: string } {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function safeJsonParseProject(raw: string | null | undefined): { style?: string; format?: string; imageSize?: string } {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EpisodeListPanel({
  projectId,
  project,
}: {
  projectId: string;
  project: ComicProject;
}) {
  const queryClient = useQueryClient();
  const [busyEpId, setBusyEpId] = useState("");

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  const bundleMut = useMutation({
    mutationFn: () => importComicSourceBundle(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project", projectId] });
      toast.success("内容源已导入");
    },
  });

  const outlineMut = useMutation({
    mutationFn: ({ startOrder, count }: { startOrder?: number; count?: number }) =>
      generateComicOutline(projectId, { startOrder, count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      toast.success("大纲生成完成");
    },
    onError: (e) => toast.error(String(e)),
  });

  const scriptMut = useMutation({
    mutationFn: (episodeId: string) => generateComicPanelScript(episodeId),
    onMutate: (id) => setBusyEpId(id),
    onSuccess: (ep) => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      toast.success(`第 ${ep?.order ?? "?"} 话脚本生成完成`);
    },
    onError: (e) => toast.error(String(e)),
    onSettled: () => setBusyEpId(""),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {!project.sourceBundle && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bundleMut.isPending}
            onClick={() => bundleMut.mutate()}
          >
            <Layers className="h-4 w-4" />
            {bundleMut.isPending ? "导入中…" : "导入内容源"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={outlineMut.isPending || !project.sourceBundle}
          onClick={() => outlineMut.mutate({ startOrder: (episodes.length || 0) + 1, count: 12 })}
        >
          <Sparkles className="h-4 w-4" />
          {outlineMut.isPending ? "生成中…" : `生成第 ${(episodes.length || 0) + 1}-${(episodes.length || 0) + 12} 话大纲`}
        </Button>
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>}

      {!isLoading && episodes.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          尚无分话大纲，点击「生成大纲」开始。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {episodes.map((ep) => (
          <Card key={ep.id} className="rounded-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">
                  第 {ep.order} 话 {ep.title ? `《${ep.title}》` : ""}
                </CardTitle>
                <div className="flex gap-1">
                  {ep.isPaywalled && <Badge variant="destructive" className="h-5 text-xs">卡点</Badge>}
                  <Badge variant="outline" className="h-5 text-xs">{ep._count?.panels ?? 0} 格</Badge>
                </div>
              </div>
              {ep.outline && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{ep.outline}</p>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={busyEpId === ep.id || !ep.outline}
                onClick={() => scriptMut.mutate(ep.id)}
              >
                {busyEpId === ep.id ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 生成脚本…</>
                ) : (
                  <><BookOpen className="h-3.5 w-3.5" /> 生成分格脚本</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── BatchBar ──────────────────────────────────────────────────────────────────

function BatchBar({
  episodeId,
  provider,
  onComplete,
}: {
  episodeId: string;
  provider: string;
  onComplete: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ComicBatchJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 费用估算
  const { data: estimate } = useQuery({
    queryKey: ["comic", "batch-estimate", episodeId, provider],
    queryFn: () => estimateBatchCost(episodeId, provider || undefined),
    enabled: Boolean(episodeId),
    staleTime: 30_000,
  });

  // 轮询 job 状态
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getBatchJob(jobId);
        setJob(updated);
        if (updated.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          onComplete();
        }
      } catch { /* ignore */ }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, onComplete]);

  const startMut = useMutation({
    mutationFn: () =>
      startEpisodeBatch(episodeId, { provider: provider || undefined, concurrency: 3, skipDone: true }),
    onSuccess: ({ jobId: id }) => {
      setJobId(id);
      setJob(null);
    },
    onError: (e) => { void import("@/components/ui/toast").then(({ toast }) => toast.error(String(e))); },
  });

  const retryMut = useMutation({
    mutationFn: () => retryBatchJob(jobId!, provider || undefined),
    onSuccess: ({ jobId: id }) => {
      setJobId(id);
      setJob(null);
    },
    onError: (e) => { void import("@/components/ui/toast").then(({ toast }) => toast.error(String(e))); },
  });

  const progress = job ? (JSON.parse(job.progress) as BatchProgress) : null;
  const isRunning = job?.status === "running" || startMut.isPending;
  const hasFailures = (progress?.failedPanelIds?.length ?? 0) > 0 && job?.status !== "running";
  const pendingCount = estimate?.pendingPanels ?? 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 开始批量 */}
        <Button
          type="button"
          size="sm"
          disabled={isRunning || pendingCount === 0}
          onClick={() => startMut.mutate()}
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {isRunning ? "批量生成中…" : `批量生成 ${pendingCount > 0 ? `(${pendingCount}格)` : ""}`}
        </Button>

        {/* 重试失败 */}
        {hasFailures && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={retryMut.isPending}
            onClick={() => retryMut.mutate()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重试 {progress!.failedPanelIds.length} 格
          </Button>
        )}

        {/* 费用估算 */}
        {estimate && pendingCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" />
            约 {estimate.estimatedCentsCost} ¢
          </span>
        )}

        {/* 完成状态 */}
        {job?.status === "completed" && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ 全部完成</span>
        )}
        {job?.status === "partial" && !hasFailures && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">部分完成</span>
        )}
      </div>

      {/* 进度条 */}
      {progress && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job?.status === "partial"
                  ? "bg-amber-500"
                  : job?.status === "completed"
                  ? "bg-green-500"
                  : "bg-primary"
              }`}
              style={{
                width: `${progress.total > 0 ? Math.round(((progress.done + progress.failed) / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {progress.done} / {progress.total} 完成
              {progress.failed > 0 && (
                <span className="ml-1.5 text-destructive">{progress.failed} 失败</span>
              )}
            </span>
            <span>
              {progress.total > 0
                ? `${Math.round(((progress.done + progress.failed) / progress.total) * 100)}%`
                : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelsGridPanel({ projectId, provider }: { projectId: string; provider: string }) {
  const queryClient = useQueryClient();
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [busyPanelId, setBusyPanelId] = useState("");

  const { data: episodes = [] } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  const activeEpisode = selectedEpisodeId
    ? episodes.find((e) => e.id === selectedEpisodeId)
    : episodes[0];

  const { data: panels = [], isLoading: panelsLoading, refetch: refetchPanels } = useQuery({
    queryKey: ["comic", "panels", activeEpisode?.id],
    queryFn: () => (activeEpisode ? listComicPanels(activeEpisode.id) : Promise.resolve([])),
    enabled: Boolean(activeEpisode),
  });

  const imageMut = useMutation({
    mutationFn: (panelId: string) => generatePanelImage(panelId, provider || undefined),
    onMutate: (id) => setBusyPanelId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
    },
    onSettled: () => setBusyPanelId(""),
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      {/* 话数切换 */}
      {episodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {episodes.map((ep) => (
            <button
              key={ep.id}
              type="button"
              onClick={() => setSelectedEpisodeId(ep.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${(activeEpisode?.id === ep.id) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            >
              第 {ep.order} 话
            </button>
          ))}
        </div>
      )}

      {/* 批量生成栏 */}
      {activeEpisode && (
        <BatchBar
          episodeId={activeEpisode.id}
          provider={provider}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode.id] });
            void refetchPanels();
          }}
        />
      )}

      {panelsLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>}
      {!panelsLoading && panels.length === 0 && activeEpisode && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          该话尚无格子脚本，请先在「分话大纲」中生成分格脚本。
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {panels.map((panel) => {
          const imgData = parseImageData(panel.imageData);
          const busy = busyPanelId === panel.id;
          return (
            <div key={panel.id} className="group relative rounded-lg border bg-muted overflow-hidden">
              {imgData.status === "done" ? (
                <img
                  src={panelImageUrl(panel.id)}
                  alt={`第 ${panel.order} 格`}
                  className="aspect-[2/3] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-muted">
                  {busy || imgData.status === "generating" ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
              )}
              <div className="p-1.5 text-xs text-muted-foreground">
                <span className="font-medium">第 {panel.order} 格</span>
                <span className="ml-1 opacity-60">{panel.panelType}</span>
              </div>
              <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {imgData.status !== "done" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => imageMut.mutate(panel.id)}
                  >
                    <Sparkles className="h-3 w-3" />
                    生图
                  </Button>
                )}
                {imgData.status === "done" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => imageMut.mutate(panel.id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    重抽
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExportPanel({ projectId, episodes }: { projectId: string; episodes: ComicEpisode[] }) {
  const [selectedEpId, setSelectedEpId] = useState(episodes[0]?.id ?? "");
  const exportMut = useMutation({
    mutationFn: (episodeId: string) => exportComicEpisode(episodeId, { format: "long_image" }),
    onSuccess: (result) => {
      const artifact = result.artifacts[0];
      if (artifact?.url) {
        window.open(artifact.url, "_blank");
      }
      toast.success("导出完成");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium">选择话数</label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedEpId}
            onChange={(e) => setSelectedEpId(e.target.value)}
          >
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                第 {ep.order} 话 {ep.title ? `《${ep.title}》` : ""}（{ep._count?.panels ?? 0} 格）
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          disabled={!selectedEpId || exportMut.isPending}
          onClick={() => exportMut.mutate(selectedEpId)}
        >
          <Download className="h-4 w-4" />
          {exportMut.isPending ? "导出中…" : "导出长图"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        导出前请确保所有格子已生成图像。图像内文字由模型直接渲染。
      </p>
    </div>
  );
}

// ─── Style options ─────────────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  { value: "webtoon_color", label: "彩色韩漫", desc: "鲜艳配色，干净线条" },
  { value: "bl_manga", label: "彩色少女漫", desc: "柔和色调，精致五官" },
  { value: "shounen_bw", label: "黑白少年漫", desc: "粗犷线条，动感构图" },
  { value: "ink_traditional", label: "水墨国风", desc: "毛笔笔触，淡彩晕染" },
  { value: "chibi", label: "Q版萌漫", desc: "圆润可爱，夸张表情" },
  { value: "realistic", label: "写实风格", desc: "细腻光影，真实感" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComicProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const { data: project, isLoading } = useQuery({
    queryKey: ["comic", "project", id],
    queryFn: () => getComicProject(id!),
    enabled: Boolean(id),
  });

  const { data: episodes = [] } = useQuery({
    queryKey: ["comic", "episodes", id],
    queryFn: () => listComicEpisodes(id!),
    enabled: Boolean(id),
  });

  const { data: providerOptions = [] } = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: getAPIKeySettings,
    select: (res) =>
      (res.data ?? [])
        .filter((p) => p.supportsImageGeneration && p.isConfigured)
        .map((p) => ({ value: p.provider, label: p.displayName ?? p.name })),
  });
  const resolvedProvider = selectedProvider || providerOptions[0]?.value || "";

  const presetMut = useMutation({
    mutationFn: (payload: Parameters<typeof updateComicPreset>[1]) => updateComicPreset(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project", id] });
      setShowFormatPicker(false);
      setShowStylePicker(false);
      toast.success("设置已更新，新图片将使用新设置生成");
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!project) {
    return <div className="p-8 text-center text-muted-foreground">漫画项目不存在。</div>;
  }

  const preset = safeJsonParseProject(project.stylePreset);
  const formatDef = COMIC_FORMATS.find((f) => f.value === preset.format) ?? COMIC_FORMATS[0];
  const styleDef = STYLE_OPTIONS.find((s) => s.value === preset.style);
  const statusLabel: Record<string, string> = {
    draft: "草稿", outlined: "大纲已生成", scripted: "脚本已生成", completed: "已完成",
  };
  const sourceLabel: Record<string, string> = {
    novel_import: "小说改编", original: "原创", text_import: "文本导入", comic_import: "漫画改编",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-2">
        <Button asChild type="button" variant="ghost" size="sm" className="-ml-2">
          <a href="/comic">
            <ChevronLeft className="h-4 w-4" />
            工作台
          </a>
        </Button>
      </div>

      {/* 项目信息头部 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
              <Badge variant={project.status === "outlined" || project.status === "scripted" ? "default" : "secondary"}>
                {statusLabel[project.status] ?? project.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{sourceLabel[project.sourceType] ?? project.sourceType}</p>
          </div>

          {/* 形态卡片 — 点击展开选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowFormatPicker((v) => !v); setShowStylePicker(false); }}
              className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 hover:bg-muted/70 transition-colors"
            >
              <div className={`flex-shrink-0 ${formatDef.imageSize === "1536x1024" ? "w-14 h-9" : "w-9 h-14"} text-primary`}>
                {formatDef.layoutSvg}
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">漫画形态</p>
                <p className="text-sm font-semibold">{formatDef.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight max-w-[100px]">{formatDef.desc}</p>
              </div>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground/60 ml-1" />
            </button>

            {showFormatPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-[480px] rounded-xl border bg-popover shadow-xl p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">选择漫画形态（影响图片比例与风格关键词）</p>
                <div className="grid grid-cols-4 gap-2">
                  {COMIC_FORMATS.map((fmt) => (
                    <button
                      key={fmt.value}
                      type="button"
                      disabled={presetMut.isPending}
                      onClick={() => presetMut.mutate({ format: fmt.value, promptKeywords: fmt.promptKeywords, imageSize: fmt.imageSize })}
                      className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors hover:bg-accent ${fmt.value === formatDef.value ? "border-primary bg-primary/5" : ""}`}
                    >
                      {fmt.value === formatDef.value && (
                        <Check className="absolute top-1.5 right-1.5 h-3 w-3 text-primary" />
                      )}
                      <div className={`${fmt.imageSize === "1536x1024" ? "w-12 h-8" : "w-8 h-12"} text-primary`}>
                        {fmt.layoutSvg}
                      </div>
                      <span className="text-xs font-medium">{fmt.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{fmt.tag}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowFormatPicker(false)}
                  className="mt-3 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 统计指标行 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
            <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">话数</p>
              <p className="text-lg font-bold leading-tight">{episodes.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
            <Film className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">总格数</p>
              <p className="text-lg font-bold leading-tight">
                {episodes.reduce((s, e) => s + (e._count?.panels ?? 0), 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">角色</p>
              <p className="text-lg font-bold leading-tight">{project._count?.characters ?? project.characters.length}</p>
            </div>
          </div>

          {/* 画风 — 点击展开选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowStylePicker((v) => !v); setShowFormatPicker(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <Palette className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-[11px] text-muted-foreground">画风</p>
                <p className="text-sm font-semibold leading-tight truncate">
                  {styleDef?.label ?? preset.style ?? "默认"}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
            </button>

            {showStylePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border bg-popover shadow-xl p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">选择画风</p>
                <div className="space-y-1">
                  {STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={presetMut.isPending}
                      onClick={() => presetMut.mutate({ style: opt.value })}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${opt.value === preset.style ? "bg-primary/5 text-primary font-medium" : ""}`}
                    >
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{opt.desc}</span>
                      </div>
                      {opt.value === preset.style && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowStylePicker(false)}
                  className="mt-2 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 技术参数行 */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
            <LayoutTemplate className="h-3 w-3" />
            {formatDef.imageSize}
          </span>
          {project.sourceBundle && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-green-500/10 px-2.5 py-0.5 text-xs text-green-600 dark:text-green-400">
              <BookText className="h-3 w-3" />
              内容源已导入
            </span>
          )}
          {preset.format && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
              {formatDef.tag}
            </span>
          )}
          {/* 图片模型全局选择器 */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">图片模型</span>
            {providerOptions.length === 0 ? (
              <span className="text-xs text-destructive">暂无可用图片服务</span>
            ) : (
              <select
                className="rounded-md border bg-background px-2.5 py-1 text-xs"
                value={resolvedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {providerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="outline">
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="outline">分话大纲</TabsTrigger>
          <TabsTrigger value="panels">格子图</TabsTrigger>
          <TabsTrigger value="characters">
            角色
            {project.characters.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {project.characters.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="export">导出</TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="mt-4">
          <EpisodeListPanel projectId={id!} project={project} />
        </TabsContent>

        <TabsContent value="panels" className="mt-4">
          <PanelsGridPanel projectId={id!} provider={resolvedProvider} />
        </TabsContent>

        <TabsContent value="characters" className="mt-4">
          <CharactersPanel project={project} provider={resolvedProvider} />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          {episodes.length > 0 ? (
            <ExportPanel projectId={id!} episodes={episodes} />
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              请先生成分话大纲。
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
