import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  Download,
  Loader2,
  Pencil,
  BookText,
  Palette,
  LayoutTemplate,
  Film,
  Hash,
  Users,
  Check,
} from "lucide-react";
import {
  exportComicEpisode,
  getComicProject,
  listComicEpisodes,
  updateComicPreset,
  type ComicEpisode,
  type ComicProject,
} from "@/api/comic";

import { COMIC_FORMATS } from "@/pages/comic/ComicWorkspacePage";
import { CharactersPanel } from "@/pages/comic/project/CharactersPanel";
import { ScenesPanel } from "@/pages/comic/project/ScenesPanel";
import { EpisodeListPanel } from "@/pages/comic/project/EpisodeListPanel";
import { PanelsGridPanel } from "@/pages/comic/project/PanelsGridPanel";
import { getAPIKeySettings } from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParseProject(raw: string | null | undefined): { style?: string; format?: string; imageSize?: string } {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
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
      toast.success(t("gen.pages.comic.ComicProjectPage.gen_446e67b3"));
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium">{t("gen.pages.comic.ComicProjectPage.gen_9c475757")}</label>
          <SelectControl
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedEpId}
            onChange={(e) => setSelectedEpId(e.target.value)}
          >
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                第 {ep.order} 话 {ep.title ? `《${ep.title}》` : ""}（{ep._count?.panels ?? 0} 格）
              </option>
            ))}
          </SelectControl>
        </div>
        <Button
          type="button"
          disabled={!selectedEpId || exportMut.isPending}
          onClick={() => exportMut.mutate(selectedEpId)}
        >
          <Download className="h-4 w-4" />
          {exportMut.isPending ? t("gen.pages.comic.ComicProjectPage.gen_86f99e94") : t("gen.pages.comic.ComicProjectPage.gen_533dd8ac")}
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
  { value: "webtoon_color", label: t("gen.pages.comic.ComicProjectPage.gen_b8cc9e43"), desc: t("gen.pages.comic.ComicProjectPage.gen_90cb877d") },
  { value: "bl_manga", label: t("gen.pages.comic.ComicProjectPage.gen_3cd93268"), desc: t("gen.pages.comic.ComicProjectPage.gen_c936bee0") },
  { value: "shounen_bw", label: t("gen.pages.comic.ComicProjectPage.gen_4a12b411"), desc: t("gen.pages.comic.ComicProjectPage.gen_fa800819") },
  { value: "ink_traditional", label: t("gen.pages.comic.ComicProjectPage.gen_452631b4"), desc: t("gen.pages.comic.ComicProjectPage.gen_a96b4e38") },
  { value: "chibi", label: t("gen.pages.comic.ComicProjectPage.gen_Q版萌漫_amz0"), desc: t("gen.pages.comic.ComicProjectPage.gen_06de46d6") },
  { value: "realistic", label: t("gen.pages.comic.ComicProjectPage.gen_11eaab19"), desc: t("gen.pages.comic.ComicProjectPage.gen_e1f28055") },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComicProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  // 图片模型选择跨项目/跨刷新保留（用户通常长期用同一个图片模型）
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    try { return localStorage.getItem("comic.preferredImageProvider") ?? ""; } catch { return ""; }
  });
  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    try { localStorage.setItem("comic.preferredImageProvider", value); } catch { /* ignore */ }
  };

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
  // 缓存的 provider 仍存在于可用列表才用，否则回退到第一个（避免引用已失效的 provider 配置）
  const resolvedProvider =
    (selectedProvider && providerOptions.some((p) => p.value === selectedProvider))
      ? selectedProvider
      : providerOptions[0]?.value || "";

  const presetMut = useMutation({
    mutationFn: (payload: Parameters<typeof updateComicPreset>[1]) => updateComicPreset(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project", id] });
      setShowFormatPicker(false);
      setShowStylePicker(false);
      toast.success(t("gen.pages.comic.ComicProjectPage.gen_de563886"));
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
    return <div className="p-8 text-center text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_3e8c67c3")}</div>;
  }

  const preset = safeJsonParseProject(project.stylePreset);
  const formatDef = COMIC_FORMATS.find((f) => f.value === preset.format) ?? COMIC_FORMATS[0];
  const styleDef = STYLE_OPTIONS.find((s) => s.value === preset.style);
  const statusLabel: Record<string, string> = {
    draft: t("gen.pages.comic.ComicProjectPage.gen_22b4334f"), outlined: t("gen.pages.comic.ComicProjectPage.gen_05dab7aa"), scripted: t("gen.pages.comic.ComicProjectPage.gen_1361ca2d"), completed: t("gen.pages.comic.ComicProjectPage.gen_fad5222c"),
  };
  const sourceLabel: Record<string, string> = {
    novel_import: t("gen.pages.comic.ComicProjectPage.gen_a07eb9b4"), original: t("gen.pages.comic.ComicProjectPage.gen_3f00cc1b"), text_import: t("gen.pages.comic.ComicProjectPage.gen_8ffd512f"), comic_import: t("gen.pages.comic.ComicProjectPage.gen_c12f11f5"),
  };

  return (
    <div className="w-full space-y-5 px-4 py-6 lg:px-6">
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
                <p className="text-xs text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_66c8471a")}</p>
                <p className="text-sm font-semibold">{formatDef.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight max-w-[100px]">{formatDef.desc}</p>
              </div>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground/60 ml-1" />
            </button>

            {showFormatPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-[480px] rounded-xl border bg-popover shadow-xl p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">{t("gen.pages.comic.ComicProjectPage.gen_feb74a28")}</p>
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
              <p className="text-[11px] text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_189b6c06")}</p>
              <p className="text-lg font-bold leading-tight">{episodes.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
            <Film className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_adfec444")}</p>
              <p className="text-lg font-bold leading-tight">
                {episodes.reduce((s, e) => s + (e._count?.panels ?? 0), 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_464f3d4e")}</p>
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
                <p className="text-[11px] text-muted-foreground">{t("gen.pages.comic.ComicProjectPage.gen_aa1262ed")}</p>
                <p className="text-sm font-semibold leading-tight truncate">
                  {styleDef?.label ?? preset.style ?? t("gen.pages.comic.ComicProjectPage.gen_18c63459")}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
            </button>

            {showStylePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border bg-popover shadow-xl p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("gen.pages.comic.ComicProjectPage.gen_3c4b38d0")}</p>
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
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("gen.pages.comic.ComicProjectPage.gen_eae0b949")}</span>
            {providerOptions.length === 0 ? (
              <span className="text-xs text-destructive">{t("gen.pages.comic.ComicProjectPage.gen_15e5d13c")}</span>
            ) : (
              <SelectControl
                className="rounded-md border bg-background px-2.5 py-1 text-xs"
                value={resolvedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SelectControl>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="outline">
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="outline">{t("gen.pages.comic.ComicProjectPage.gen_34c8f296")}</TabsTrigger>
          <TabsTrigger value="characters">
            角色
            {project.characters.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {project.characters.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scenes">{t("gen.pages.comic.ComicProjectPage.gen_c931653c")}</TabsTrigger>
          <TabsTrigger value="panels">{t("gen.pages.comic.ComicProjectPage.gen_b9857430")}</TabsTrigger>
          <TabsTrigger value="export">{t("gen.pages.comic.ComicProjectPage.gen_55405ea6")}</TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="mt-4">
          <EpisodeListPanel projectId={id!} project={project} />
        </TabsContent>

        <TabsContent value="characters" className="mt-4">
          <CharactersPanel project={project} provider={resolvedProvider} />
        </TabsContent>

        <TabsContent value="scenes" className="mt-4">
          <ScenesPanel project={project} provider={resolvedProvider} />
        </TabsContent>

        <TabsContent value="panels" className="mt-4">
          <PanelsGridPanel projectId={id!} provider={resolvedProvider} />
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
