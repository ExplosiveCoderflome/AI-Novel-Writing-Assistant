import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronLeft,
  Download,
  ImageOff,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Type,
} from "lucide-react";
import {
  exportComicEpisode,
  generateComicOutline,
  generateComicPanelScript,
  generatePanelImage,
  getComicProject,
  importComicSourceBundle,
  letterPanel,
  listComicEpisodes,
  listComicPanels,
  panelImageUrl,
  panelLetteredImageUrl,
  type ComicEpisode,
  type ComicPanel,
  type ComicProject,
} from "@/api/comic";
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

function PanelsGridPanel({ projectId }: { projectId: string }) {
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

  const { data: panels = [], isLoading: panelsLoading } = useQuery({
    queryKey: ["comic", "panels", activeEpisode?.id],
    queryFn: () => (activeEpisode ? listComicPanels(activeEpisode.id) : Promise.resolve([])),
    enabled: Boolean(activeEpisode),
  });

  const imageMut = useMutation({
    mutationFn: (panelId: string) => generatePanelImage(panelId),
    onMutate: (id) => setBusyPanelId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
    },
    onSettled: () => setBusyPanelId(""),
    onError: (e) => toast.error(String(e)),
  });

  const letterMut = useMutation({
    mutationFn: (panelId: string) => letterPanel(panelId),
    onMutate: (id) => setBusyPanelId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
      toast.success("气泡排版完成");
    },
    onSettled: () => setBusyPanelId(""),
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
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

      {panelsLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>}
      {!panelsLoading && panels.length === 0 && activeEpisode && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          该话尚无格子脚本，请先在「分话大纲」中生成分格脚本。
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {panels.map((panel) => {
          const imgData = parseImageData(panel.imageData);
          const hasLettered = Boolean(parseImageData(panel.letteredData).url);
          const busy = busyPanelId === panel.id;
          return (
            <div key={panel.id} className="group relative rounded-lg border bg-muted overflow-hidden">
              {imgData.status === "done" ? (
                <img
                  src={hasLettered ? panelLetteredImageUrl(panel.id) : panelImageUrl(panel.id)}
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
                {imgData.status === "done" && !hasLettered && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => letterMut.mutate(panel.id)}
                  >
                    <Type className="h-3 w-3" />
                    加气泡
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
        导出前请确保已为所有格子生成图像并完成气泡排版。
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComicProjectPage() {
  const { id } = useParams<{ id: string }>();

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

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button asChild type="button" variant="ghost" size="sm">
          <a href="/comic">
            <ChevronLeft className="h-4 w-4" />
            工作台
          </a>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            {project.sourceType === "novel_import" ? "小说改编" : "原创"} · {project.status}
          </p>
        </div>
      </div>

      <Tabs defaultValue="outline">
        <TabsList className="w-full justify-start gap-1">
          <TabsTrigger value="outline">分话大纲</TabsTrigger>
          <TabsTrigger value="panels">格子图</TabsTrigger>
          <TabsTrigger value="export">导出</TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="mt-4">
          <EpisodeListPanel projectId={id!} project={project} />
        </TabsContent>

        <TabsContent value="panels" className="mt-4">
          <PanelsGridPanel projectId={id!} />
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
