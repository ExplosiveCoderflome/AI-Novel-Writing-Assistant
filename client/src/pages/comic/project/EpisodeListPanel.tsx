import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Layers, Loader2, Sparkles } from "lucide-react";
import {
  generateComicOutline,
  generateComicPanelScript,
  importComicSourceBundle,
  listComicEpisodes,
  type ComicProject,
  type GenerateScriptPayload,
} from "@/api/comic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type DensityMode = NonNullable<GenerateScriptPayload["densityMode"]>;

const DENSITY_OPTIONS: Array<{
  value: DensityMode;
  label: string;
  desc: string;
}> = [
  { value: "relaxed", label: "舒展", desc: "情绪和反应更清楚" },
  { value: "balanced", label: "均衡", desc: "默认漫画节奏" },
  { value: "compact", label: "紧凑", desc: "剧情推进更密集" },
];

const DENSITY_LABELS: Record<DensityMode, string> = {
  relaxed: "舒展",
  balanced: "均衡",
  compact: "紧凑",
};

function parsePresetFormat(raw: string | null | undefined): string {
  if (!raw) return "webtoon";
  try {
    const parsed = JSON.parse(raw) as { format?: string };
    return parsed.format ?? "webtoon";
  } catch {
    return "webtoon";
  }
}

function parseScriptConfig(raw: string | null | undefined): {
  densityMode?: DensityMode;
  targetPanelCount?: number;
  comicFormat?: string;
  generatedAt?: string;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveTargetPanelCount(densityMode: DensityMode, format: string): number {
  if (format === "4koma") {
    if (densityMode === "relaxed") return 10;
    if (densityMode === "compact") return 16;
    return 12;
  }
  if (densityMode === "relaxed") return 30;
  if (densityMode === "compact") return 65;
  return 45;
}

export function EpisodeListPanel({
  projectId,
  project,
}: {
  projectId: string;
  project: ComicProject;
}) {
  const queryClient = useQueryClient();
  const [busyEpId, setBusyEpId] = useState("");
  const [densityMode, setDensityMode] = useState<DensityMode>("balanced");
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [scriptPromptInstruction, setScriptPromptInstruction] = useState("");

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  const format = parsePresetFormat(project.stylePreset);
  const targetPanelCount = resolveTargetPanelCount(densityMode, format);

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
    mutationFn: ({ episodeId, payload }: { episodeId: string; payload: GenerateScriptPayload }) =>
      generateComicPanelScript(episodeId, payload),
    onMutate: ({ episodeId }) => setBusyEpId(episodeId),
    onSuccess: (ep) => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", ep?.id] });
      toast.success(`第 ${ep?.order ?? "?"} 话脚本生成完成`);
    },
    onError: (e) => toast.error(String(e)),
    onSettled: () => setBusyEpId(""),
  });

  const generateScript = (episode: { id: string; _count?: { panels: number }; outline?: string | null }) => {
    if ((episode._count?.panels ?? 0) > 0) {
      const ok = window.confirm("重新生成会替换本话已有格子脚本，并影响后续批量生图。继续生成吗？");
      if (!ok) return;
    }
    scriptMut.mutate({
      episodeId: episode.id,
      payload: {
        targetPanelCount,
        densityMode,
        scriptPromptInstruction: scriptPromptInstruction.trim() || undefined,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                {bundleMut.isPending ? "导入中..." : "导入内容源"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={outlineMut.isPending || !project.sourceBundle}
              onClick={() => outlineMut.mutate({ startOrder: (episodes.length || 0) + 1, count: 12 })}
            >
              <Sparkles className="h-4 w-4" />
              {outlineMut.isPending ? "生成中..." : `生成第 ${(episodes.length || 0) + 1}-${(episodes.length || 0) + 12} 话大纲`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPromptSettings((v) => !v)}
            >
              <FileText className="h-4 w-4" />
              分格生成要求
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">信息密度</span>
            <div className="flex rounded-md border bg-background p-0.5">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    densityMode === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                  onClick={() => setDensityMode(option.value)}
                  title={option.desc}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">约 {targetPanelCount} 格</span>
          </div>
        </div>

        {showPromptSettings && (
          <div className="mt-3 space-y-2">
            <textarea
              value={scriptPromptInstruction}
              maxLength={1000}
              onChange={(event) => setScriptPromptInstruction(event.target.value)}
              placeholder="可补充本次分格重点，例如：多给主角冷静反应特写，避免每格都塞满背景，结尾强化悬念。"
              className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs leading-relaxed"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>这些要求只影响本次分格生成，不会覆盖角色锚点、画风和结构化输出规则。</span>
              <span>{scriptPromptInstruction.length}/1000</span>
            </div>
          </div>
        )}
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>}

      {!isLoading && episodes.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          尚无分话大纲，点击「生成大纲」开始。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {episodes.map((ep) => {
          const scriptConfig = parseScriptConfig(ep.scriptConfig);
          return (
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
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ep.outline}</p>
                )}
                {scriptConfig.densityMode && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded border bg-muted/40 px-2 py-0.5">
                      {DENSITY_LABELS[scriptConfig.densityMode]}密度
                    </span>
                    {scriptConfig.targetPanelCount ? (
                      <span className="rounded border bg-muted/40 px-2 py-0.5">约 {scriptConfig.targetPanelCount} 格</span>
                    ) : null}
                    {scriptConfig.comicFormat ? (
                      <span className="rounded border bg-muted/40 px-2 py-0.5">{scriptConfig.comicFormat}</span>
                    ) : null}
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busyEpId === ep.id || !ep.outline}
                  onClick={() => generateScript(ep)}
                >
                  {busyEpId === ep.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成脚本...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-3.5 w-3.5" />
                      生成分格脚本
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
