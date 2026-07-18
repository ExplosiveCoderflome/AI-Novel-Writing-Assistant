import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
  preparePanelImage,
  retryBatchJob,
  startEpisodeBatch,
  updatePanelVisualPrompt,
  type BatchProgress,
  type ComicBatchJob,
  type ComicDialogue,
  type ComicPanel,
} from "@/api/comic";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
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
  character_sheet: t("gen.pages.comic.project.PanelsGridPanel.threeViews"),
  character_expression: t("gen.pages.comic.project.PanelsGridPanel.gen_1a07c5a4"),
  character_face: t("gen.pages.comic.project.PanelsGridPanel.gen_0a071b57"),
  asset: t("gen.pages.comic.project.PanelsGridPanel.gen_5110a0d1"),
  scene: t("gen.pages.comic.project.PanelsGridPanel.gen_c931653c"),
};

const REF_KIND_COLOR: Record<string, string> = {
  character_sheet: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  character_expression: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  character_face: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  asset: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  scene: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
};

const DENSITY_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: t("gen.pages.comic.project.PanelsGridPanel.lowDensity"), className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  medium: { label: t("gen.pages.comic.project.PanelsGridPanel.mediumDensity"), className: "border-sky-200 bg-sky-50 text-sky-700" },
  high: { label: t("gen.pages.comic.project.PanelsGridPanel.gen_f7dcc0ac"), className: "border-amber-200 bg-amber-50 text-amber-700" },
};

function densityBadge(value: string | null | undefined): { label: string; className: string } {
  return DENSITY_BADGE[value ?? ""] ?? { label: t("gen.pages.comic.project.PanelsGridPanel.gen_cb456b11"), className: "border-border bg-muted text-muted-foreground" };
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
          {isRunning ? t("gen.pages.comic.project.PanelsGridPanel.gen_f68f4817") : `批量生成 ${pendingCount > 0 ? `(${pendingCount}格)` : ""}`}
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
          <span className="text-xs font-medium text-green-600 dark:text-green-400">{t("gen.pages.comic.project.PanelsGridPanel.gen_7eda596a")}</span>
        )}
        {job?.status === "partial" && !hasFailures && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("gen.pages.comic.project.PanelsGridPanel.gen_963e0afb")}</span>
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
                <span className="ml-1.5 text-destructive">{t("gen.pages.comic.project.PanelsGridPanel.progressFailed")}</span>
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
              <span className="font-medium text-foreground">{t("gen.pages.comic.project.PanelsGridPanel.gen_8e2e31c5")}</span>
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
  provider,
  onClose,
  onGenerate,
  onSaved,
}: {
  panel: ComicPanel;
  busy: boolean;
  provider: string;
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

  // 局部微调状态与 Canvas 坐标选择
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditingImage || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isEditingImage || !startPos || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const w = Math.abs(startPos.x - currentX);
    const h = Math.abs(startPos.y - currentY);

    setBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    setStartPos(null);
  };

  const submitEdit = async () => {
    if (!editPrompt.trim() || !imgRef.current) return;
    setIsSubmittingEdit(true);
    try {
      const img = imgRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // 绘制原图
      ctx.drawImage(img, 0, 0);

      // 如果有选择红框，在画布上叠加绘制红色线框
      if (box && box.w > 2 && box.h > 2) {
        const displayW = img.clientWidth;
        const displayH = img.clientHeight;
        const scaleX = img.naturalWidth / displayW;
        const scaleY = img.naturalHeight / displayH;

        const rx = box.x * scaleX;
        const ry = box.y * scaleY;
        const rw = box.w * scaleX;
        const rh = box.h * scaleY;

        ctx.strokeStyle = "red";
        ctx.lineWidth = Math.max(3, Math.round(img.naturalWidth / 200));
        ctx.strokeRect(rx, ry, rw, rh);
      }

      const base64Data = canvas.toDataURL("image/png");

      const { editPanelImage } = await import("@/api/comic");
      await editPanelImage({
        assetId: panel.id,
        imageBase64: base64Data,
        prompt: editPrompt,
        provider: provider || "sensenova",
      });

      toast.success("画面局部微调成功！");
      setIsEditingImage(false);
      setBox(null);
      setEditPrompt("");
      // 触发外部保存状态，以拉取最新图片
      onSaved({ ...panel });
    } catch (err) {
      toast.error(`微调失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  useEffect(() => {
    setDraftVisualPrompt(panel.visualPrompt);
    setIsEditing(false);
  }, [panel.id, panel.visualPrompt]);

  const savePromptMut = useMutation({
    mutationFn: () => updatePanelVisualPrompt(panel.id, draftVisualPrompt.trim()),
    onSuccess: (updatedPanel) => {
      onSaved(updatedPanel);
      setIsEditing(false);
      toast.success(t("gen.pages.comic.project.PanelsGridPanel.gen_c4a143ac"));
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
        description={t("gen.pages.comic.project.PanelsGridPanel.gen_2a07f258")}
        className="max-w-4xl"
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-0 lg:flex-row">
          <div className={`border-b bg-muted/30 p-4 lg:border-b-0 lg:border-r transition-all duration-300 ${isEditingImage ? "lg:w-[450px]" : "lg:w-56"}`}>
            {imageData.status === "done" ? (
              <div
                className={`relative select-none ${isEditingImage ? "cursor-crosshair border border-primary border-dashed rounded-md overflow-hidden" : ""}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <img
                  ref={imgRef}
                  src={panelImageUrl(panel.id)}
                  alt={`第 ${panel.order} 格`}
                  className="mx-auto max-h-72 w-full rounded-md object-contain lg:max-h-none pointer-events-none"
                />
                {box && (
                  <div
                    className="absolute border-2 border-red-500 bg-red-500/25 pointer-events-none animate-pulse"
                    style={{
                      left: box.x,
                      top: box.y,
                      width: box.w,
                      height: box.h,
                    }}
                  />
                )}
                {imageStale && !isEditingImage && (
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
              disabled={busy || savePromptMut.isPending || isEditingImage}
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
            {imageStale && !isEditingImage && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
                画面脚本已在上次生图后修改，重抽后图片才会使用新的脚本。
              </p>
            )}
            {imageData.status === "done" && (
              <div className="mt-2 space-y-2">
                {!isEditingImage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => setIsEditingImage(true)}
                  >
                    局部微调 (红框标记)
                  </Button>
                ) : (
                  <div className="rounded border bg-background p-2.5 space-y-2 text-xs">
                    <div className="font-semibold text-muted-foreground">在图上拖拽绘制红色标记框，并输入修改指令：</div>
                    <textarea
                      placeholder="修改指令，例如：将红框中的头发改为银色，去除背景中的杂物"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded border p-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 text-[11px] h-7"
                        disabled={isSubmittingEdit || !editPrompt.trim()}
                        onClick={submitEdit}
                      >
                        {isSubmittingEdit ? "正在提交..." : "确认修改"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-[11px] h-7"
                        onClick={() => {
                          setIsEditingImage(false);
                          setBox(null);
                          setEditPrompt("");
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4 p-4">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{t("gen.pages.comic.project.PanelsGridPanel.gen_bb47cf4a")}</span>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${density.className}`}>{density.label}</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5 text-sm">{panel.action}</div>
            </div>

            {panel.focus && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">{t("gen.pages.comic.project.PanelsGridPanel.mainVisualFocus")}</div>
                <div className="rounded bg-muted/60 px-2 py-1.5 text-sm">{panel.focus}</div>
              </div>
            )}

            {layoutData.layout && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">{t("gen.pages.comic.project.PanelsGridPanel.gen_f573af34")}</div>
                <div className="rounded border bg-muted/40 px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                  <div className="font-medium text-foreground">{t("gen.pages.comic.project.PanelsGridPanel.layoutType")}</div>
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
                <span className="text-xs font-semibold text-muted-foreground">{t("gen.pages.comic.project.PanelsGridPanel.gen_909b8275")}</span>
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
                  {isEditing ? t("gen.pages.comic.project.PanelsGridPanel.gen_cbb46593") : t("gen.pages.comic.project.PanelsGridPanel.gen_95b351c8")}
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
                <span>{t("gen.pages.comic.project.PanelsGridPanel.savedThenNextImageGenerationWillUseThisSceneScript")}</span>
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
  const imageFlow = useImageGenerationFlow();

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

  const startPanelGeneration = (panelId: string) => {
    imageFlow.start({
      prepare: () => preparePanelImage(panelId, provider || undefined),
      generate: async (overrides) => {
        setBusyPanelId(panelId);
        try {
          return await generatePanelImage(panelId, provider || undefined, overrides);
        } finally {
          setBusyPanelId("");
        }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
      },
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
      },
    });
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, panel: ComicPanel) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedPanel(panel);
  };

  return (
    <div className="space-y-4">
      <ImageGenerationConfirmDialog {...imageFlow.dialogProps} />
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
              title={t("gen.pages.comic.project.PanelsGridPanel.gen_8fe0d275")}
              className={`rounded p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t("gen.pages.comic.project.PanelsGridPanel.gen_afd428f9")}
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

      {panelsLoading && <div className="py-8 text-center text-sm text-muted-foreground">{t("gen.pages.comic.project.PanelsGridPanel.gen_26b5bd49")}</div>}
      {!panelsLoading && panels.length === 0 && activeEpisode && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          该话尚无格子脚本，请先在「分话大纲」中生成分格脚本。
        </div>
      )}

      {selectedPanel && (
        <PanelDetailDialog
          panel={selectedPanel}
          busy={busyPanelId === selectedPanel.id}
          provider={provider}
          onClose={() => setSelectedPanel(null)}
          onGenerate={startPanelGeneration}
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
            onGenerate={startPanelGeneration}
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
                    <span className="font-medium">{t("gen.pages.comic.project.PanelsGridPanel.gen_8e2e31c5")}</span>
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
                        startPanelGeneration(panel.id);
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
                        startPanelGeneration(panel.id);
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
