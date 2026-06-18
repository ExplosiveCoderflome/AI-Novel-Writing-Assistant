import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  ImageOff,
  LayoutGrid,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Rows3,
} from "lucide-react";
import {
  estimateBatchCost,
  generatePanelImage,
  getBatchJob,
  listComicEpisodes,
  listComicPanels,
  panelImageUrl,
  retryBatchJob,
  startEpisodeBatch,
  updatePanelVisualPrompt,
  type BatchProgress,
  type ComicBatchJob,
  type ComicDialogue,
  type ComicPanel,
} from "@/api/comic";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

function parseImageData(
  raw: string | null | undefined,
): {
  status?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  referenceImages?: Array<{ kind: string; label: string; url: string }>;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const REF_KIND_LABEL: Record<string, string> = {
  character_sheet: "三视图",
  character_expression: "表情稿",
  character_face: "面部裁剪",
  asset: "资产",
  scene: "场景",
};

const REF_KIND_COLOR: Record<string, string> = {
  character_sheet: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  character_expression: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  character_face: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  asset: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  scene: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
};

const DENSITY_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "低密度", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  medium: { label: "中密度", className: "border-sky-200 bg-sky-50 text-sky-700" },
  high: { label: "高密度", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

function densityBadge(value: string | null | undefined): { label: string; className: string } {
  return DENSITY_BADGE[value ?? ""] ?? { label: "未标注", className: "border-border bg-muted text-muted-foreground" };
}

function parseLayoutData(raw: string | null | undefined): {
  layout?: string;
  subPanels?: Array<{ order?: number; beat?: string; visualPrompt?: string }>;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isPanelImageStale(panel: ComicPanel, imageData: { status?: string; generatedAt?: string }): boolean {
  if (imageData.status !== "done" || !imageData.generatedAt || !panel.updatedAt) return false;
  const imageGeneratedAt = Date.parse(imageData.generatedAt);
  const panelUpdatedAt = Date.parse(panel.updatedAt);
  if (Number.isNaN(imageGeneratedAt) || Number.isNaN(panelUpdatedAt)) return false;
  return panelUpdatedAt > imageGeneratedAt + 1000;
}

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

  const { data: estimate } = useQuery({
    queryKey: ["comic", "batch-estimate", episodeId, provider],
    queryFn: () => estimateBatchCost(episodeId, provider || undefined),
    enabled: Boolean(episodeId),
    staleTime: 30_000,
  });

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
      } catch {
        // Polling failures are transient and should not interrupt the workspace.
      }
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
    onError: (e) => toast.error(String(e)),
  });

  const retryMut = useMutation({
    mutationFn: () => retryBatchJob(jobId!, provider || undefined),
    onSuccess: ({ jobId: id }) => {
      setJobId(id);
      setJob(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const progress = job ? (JSON.parse(job.progress) as BatchProgress) : null;
  const isRunning = job?.status === "running" || startMut.isPending;
  const hasFailures = (progress?.failedPanelIds?.length ?? 0) > 0 && job?.status !== "running";
  const pendingCount = estimate?.pendingPanels ?? 0;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isRunning || pendingCount === 0}
          onClick={() => startMut.mutate()}
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {isRunning ? "批量生成中..." : `批量生成 ${pendingCount > 0 ? `(${pendingCount}格)` : ""}`}
        </Button>

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

        {estimate && pendingCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" />
            约 {estimate.estimatedCentsCost} ¢
          </span>
        )}

        {job?.status === "completed" && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">全部完成</span>
        )}
        {job?.status === "partial" && !hasFailures && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">部分完成</span>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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

function parseDialogues(raw: string | null | undefined): ComicDialogue[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ComicDialogue[];
  } catch {
    return [];
  }
}

// ─── Strip view ──────────────────────────────────────────────────────────────

function StripView({
  panels,
  busyPanelId,
  onSelect,
  onGenerate,
}: {
  panels: ComicPanel[];
  busyPanelId: string;
  onSelect: (panel: ComicPanel) => void;
  onGenerate: (panelId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0">
      {panels.map((panel, idx) => {
        const imageData = parseImageData(panel.imageData);
        const dialogues = parseDialogues(panel.dialogues);
        const imageStale = isPanelImageStale(panel, imageData);
        const busy = busyPanelId === panel.id;

        return (
          <div key={panel.id} className="group relative border-b last:border-b-0">
            <div className="relative w-full overflow-hidden bg-black">
              {imageData.status === "done" ? (
                <>
                  <img
                    src={panelImageUrl(panel.id)}
                    alt={`第 ${panel.order} 格`}
                    className="w-full object-cover"
                    loading={idx < 3 ? "eager" : "lazy"}
                  />
                  {imageStale && (
                    <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      待重抽
                    </span>
                  )}
                  {dialogues.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      {dialogues.map((d, i) => (
                        <div key={i} className="text-xs leading-relaxed text-white">
                          {d.speaker && <span className="mr-1 font-bold text-yellow-200">{d.speaker}：</span>}
                          「{d.text}」
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-40 items-center justify-center bg-muted">
                  {busy || imageData.status === "generating" ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">第 {panel.order} 格</span>
              <span className="opacity-60">{panel.panelType}</span>
              {panel.focus && <span className="flex-1 truncate">{panel.focus}</span>}
              <div className="ml-auto flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {imageData.status !== "done" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onGenerate(panel.id)}
                  >
                    <Sparkles className="h-3 w-3" />
                    生图
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onGenerate(panel.id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    重抽
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onSelect(panel)}
                >
                  <FileText className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PanelDetailDialog({
  panel,
  busy,
  onClose,
  onGenerate,
  onSaved,
}: {
  panel: ComicPanel;
  busy: boolean;
  onClose: () => void;
  onGenerate: (panelId: string) => void;
  onSaved: (panel: ComicPanel) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftVisualPrompt, setDraftVisualPrompt] = useState(panel.visualPrompt);
  const imageData = parseImageData(panel.imageData);
  const density = densityBadge(panel.densityLevel);
  const layoutData = parseLayoutData(panel.layoutData);
  const imageStale = isPanelImageStale(panel, imageData);

  useEffect(() => {
    setDraftVisualPrompt(panel.visualPrompt);
    setIsEditing(false);
  }, [panel.id, panel.visualPrompt]);

  const savePromptMut = useMutation({
    mutationFn: () => updatePanelVisualPrompt(panel.id, draftVisualPrompt.trim()),
    onSuccess: (updatedPanel) => {
      onSaved(updatedPanel);
      setIsEditing(false);
      toast.success("画面脚本已保存");
    },
    onError: (e) => toast.error(String(e)),
  });

  const saveAndGenerate = () => {
    savePromptMut.mutate(undefined, {
      onSuccess: (updatedPanel) => {
        onSaved(updatedPanel);
        onGenerate(updatedPanel.id);
        onClose();
      },
    });
  };

  const canSave = draftVisualPrompt.trim().length > 0 && draftVisualPrompt.trim().length <= 400;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppDialogContent
        title={`第 ${panel.order} 格 · ${panel.panelType}`}
        description="检查并调整这一格的画面描述；重新生图会使用保存后的内容。"
        className="max-w-4xl"
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-0 lg:flex-row">
          <div className="border-b bg-muted/30 p-4 lg:w-56 lg:border-b-0 lg:border-r">
            {imageData.status === "done" ? (
              <div className="relative">
                <img
                  src={panelImageUrl(panel.id)}
                  alt={`第 ${panel.order} 格`}
                  className="mx-auto max-h-72 w-full rounded-md object-contain lg:max-h-none"
                />
                {imageStale && (
                  <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    待重抽
                  </span>
                )}
              </div>
            ) : (
              <div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted">
                <ImageOff className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full"
              disabled={busy || savePromptMut.isPending}
              onClick={() => {
                onGenerate(panel.id);
                onClose();
              }}
            >
              {imageData.status === "done" ? (
                <>
                  <RefreshCw className="h-3 w-3" />
                  重抽
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  生图
                </>
              )}
            </Button>
            {imageStale && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
                画面脚本已在上次生图后修改，重抽后图片才会使用新的脚本。
              </p>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4 p-4">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">动作描述</span>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${density.className}`}>{density.label}</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5 text-sm">{panel.action}</div>
            </div>

            {panel.focus && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">主视觉焦点</div>
                <div className="rounded bg-muted/60 px-2 py-1.5 text-sm">{panel.focus}</div>
              </div>
            )}

            {layoutData.layout && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">版式结构</div>
                <div className="rounded border bg-muted/40 px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                  <div className="font-medium text-foreground">{layoutData.layout === "four_koma" ? "四格起承转合" : layoutData.layout}</div>
                  {layoutData.subPanels?.length ? (
                    <div className="mt-1 space-y-1">
                      {layoutData.subPanels.map((subPanel) => (
                        <div key={`${subPanel.order}-${subPanel.beat}`}>
                          {subPanel.order}. {subPanel.beat}：{subPanel.visualPrompt}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">画面脚本</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={savePromptMut.isPending}
                  onClick={() => {
                    setDraftVisualPrompt(panel.visualPrompt);
                    setIsEditing((value) => !value);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  {isEditing ? "取消编辑" : "编辑"}
                </Button>
              </div>
              <textarea
                readOnly={!isEditing}
                value={draftVisualPrompt}
                maxLength={400}
                rows={5}
                onChange={(event) => setDraftVisualPrompt(event.target.value)}
                className={[
                  "w-full resize-y rounded border px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
                  isEditing ? "bg-background" : "bg-muted",
                ].join(" ")}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>保存后，下一次生图会使用这段画面脚本。</span>
                <span>{draftVisualPrompt.length}/400</span>
              </div>
              {isEditing && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSave || savePromptMut.isPending}
                    onClick={() => savePromptMut.mutate()}
                  >
                    {savePromptMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canSave || busy || savePromptMut.isPending}
                    onClick={saveAndGenerate}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    保存并生图
                  </Button>
                </div>
              )}
            </div>

            {imageData.referenceImages && imageData.referenceImages.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  本次生图使用的参考素材
                  <span className="rounded border bg-muted px-1 py-px text-[10px] font-normal text-muted-foreground">
                    {imageData.referenceImages.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {imageData.referenceImages.map((ref, i) => {
                    const kindStyle = REF_KIND_COLOR[ref.kind] ?? REF_KIND_COLOR.asset;
                    const kindLabel = REF_KIND_LABEL[ref.kind] ?? ref.kind;
                    return (
                      <a
                        key={`${ref.url}-${i}`}
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`${kindLabel} · ${ref.label}（点击查看大图）`}
                        className="group block overflow-hidden rounded border bg-background transition-colors hover:border-primary"
                      >
                        <div className="aspect-square bg-muted/30">
                          <img
                            src={ref.url}
                            alt={ref.label}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                        <div className="border-t px-1.5 py-1">
                          <span className={`inline-block rounded border px-1 py-px text-[9px] leading-none ${kindStyle}`}>
                            {kindLabel}
                          </span>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground">{ref.label}</p>
                        </div>
                      </a>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  这些素材会被合成为雪碧图后传给图像模型，用于锁定角色外形、服装、道具与场景。
                </p>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <FileText className="h-3 w-3" />
                上次发送给图像模型的 Prompt
              </div>
              {imageData.prompt ? (
                <>
                  <textarea
                    readOnly
                    value={imageData.prompt}
                    rows={6}
                    className="w-full resize-y rounded border bg-muted/60 px-2 py-1.5 text-xs leading-relaxed focus:outline-none"
                  />
                  {imageData.provider && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      模型：{imageData.provider}{imageData.generatedAt ? ` · 生成于 ${new Date(imageData.generatedAt).toLocaleString("zh-CN")}` : ""}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded bg-muted/50 px-2 py-2 text-xs text-muted-foreground">
                  生图后可在这里查看模型实际收到的完整 prompt。
                </div>
              )}
            </div>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}

export function PanelsGridPanel({ projectId, provider }: { projectId: string; provider: string }) {
  const queryClient = useQueryClient();
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [busyPanelId, setBusyPanelId] = useState("");
  const [selectedPanel, setSelectedPanel] = useState<ComicPanel | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "strip">("grid");

  const { data: episodes = [] } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  const activeEpisode = selectedEpisodeId
    ? episodes.find((episode) => episode.id === selectedEpisodeId)
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

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, panel: ComicPanel) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedPanel(panel);
  };

  return (
    <div className="space-y-4">
      {episodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {episodes.map((episode) => (
              <button
                key={episode.id}
                type="button"
                onClick={() => setSelectedEpisodeId(episode.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${(activeEpisode?.id === episode.id) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              >
                第 {episode.order} 话
              </button>
            ))}
          </div>
          <div className="ml-auto flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              title="格子视图"
              className={`rounded p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="条带视图（阅读流）"
              className={`rounded p-1.5 transition-colors ${viewMode === "strip" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("strip")}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

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

      {panelsLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>}
      {!panelsLoading && panels.length === 0 && activeEpisode && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          该话尚无格子脚本，请先在「分话大纲」中生成分格脚本。
        </div>
      )}

      {selectedPanel && (
        <PanelDetailDialog
          panel={selectedPanel}
          busy={busyPanelId === selectedPanel.id}
          onClose={() => setSelectedPanel(null)}
          onGenerate={(panelId) => imageMut.mutate(panelId)}
          onSaved={(panel) => {
            setSelectedPanel(panel);
            queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
          }}
        />
      )}

      {viewMode === "strip" ? (
        <div className="overflow-hidden rounded-lg border">
          <StripView
            panels={panels}
            busyPanelId={busyPanelId}
            onSelect={setSelectedPanel}
            onGenerate={(panelId) => imageMut.mutate(panelId)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {panels.map((panel) => {
            const imageData = parseImageData(panel.imageData);
            const density = densityBadge(panel.densityLevel);
            const imageStale = isPanelImageStale(panel, imageData);
            const busy = busyPanelId === panel.id;
            return (
              <div
                key={panel.id}
                role="button"
                tabIndex={0}
                className="group relative overflow-hidden rounded-lg border bg-muted outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedPanel(panel)}
                onKeyDown={(event) => handlePanelKeyDown(event, panel)}
              >
                {imageData.status === "done" ? (
                  <div className="relative">
                    <img
                      src={panelImageUrl(panel.id)}
                      alt={`第 ${panel.order} 格`}
                      className="aspect-[2/3] w-full object-cover"
                      loading="lazy"
                    />
                    {imageStale && (
                      <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        待重抽
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center bg-muted">
                    {busy || imageData.status === "generating" ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                )}
                <div className="p-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium">第 {panel.order} 格</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${density.className}`}>{density.label}</span>
                  </div>
                  <div className="mt-1 truncate">
                    <span className="opacity-60">{panel.panelType}</span>
                    {panel.focus ? <span className="ml-1">{panel.focus}</span> : null}
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {imageData.status !== "done" && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        imageMut.mutate(panel.id);
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      生图
                    </Button>
                  )}
                  {imageData.status === "done" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        imageMut.mutate(panel.id);
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      重抽
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedPanel(panel);
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    提示词
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
