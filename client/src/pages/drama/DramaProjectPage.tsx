import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Film,
  Layers3,
  ListVideo,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import {
  assembleDramaSourceBundle,
  createDramaVideoProviderTask,
  downloadDramaExport,
  generateDramaEpisodeScript,
  generateDramaOutline,
  generateDramaStoryboard,
  generateDramaStrategy,
  generateDramaVideoPrompt,
  getDramaProject,
  repairDramaEpisode,
  reviewDramaEpisode,
  type DramaEpisode,
  type DramaProjectDetail,
  type DramaShot,
  type DramaStoryboard,
  type DramaVideoPrompt,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type DramaTab = "source" | "strategy" | "episodes" | "characters" | "visual" | "export";

const TABS: Array<{ key: DramaTab; label: string }> = [
  { key: "source", label: "来源素材" },
  { key: "strategy", label: "短剧策略" },
  { key: "episodes", label: "分集台本" },
  { key: "characters", label: "角色" },
  { key: "visual", label: "分镜视频" },
  { key: "export", label: "导出" },
];

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "素材准备",
    strategized: "策略已生成",
    outlined: "分集已生成",
    scripting: "台本生成中",
    completed: "已完成",
    planned: "待生成台本",
    scripted: "台本已生成",
    reviewed: "已检查",
    needs_repair: "需要修复",
    approved: "已通过",
  };
  return labels[status] ?? status;
}

function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function compactText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input == null) {
    return "";
  }
  return JSON.stringify(input, null, 2);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ProjectProgress(props: { project: DramaProjectDetail }) {
  const hasBundle = Boolean(props.project.sourceBundle);
  const hasStrategy = Boolean(props.project.strategy);
  const episodeCount = props.project.episodes?.length ?? 0;
  const scriptedCount = props.project.episodes?.filter((episode) => Boolean(episode.content?.trim())).length ?? 0;
  const reviewedCount = props.project.episodes?.filter((episode) =>
    ["reviewed", "needs_repair", "approved"].includes(episode.status)
  ).length ?? 0;
  const steps = [
    { label: "素材包", done: hasBundle },
    { label: "策略", done: hasStrategy },
    { label: "分集", done: episodeCount > 0 },
    { label: "台本", done: scriptedCount > 0 },
    { label: "质量", done: reviewedCount > 0 },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {steps.map((step) => (
        <div key={step.label} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <CheckCircle2 className={step.done ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground"} />
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function SourcePanel({ project }: { project: DramaProjectDetail }) {
  const bundle = project.sourceBundle;
  const beats = safeJson<Array<Record<string, unknown>>>(bundle?.beats, []);
  const facts = safeJson<Array<{ text?: string; category?: string }>>(bundle?.hardFacts, []);

  if (!bundle) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        还没有整理来源素材。先点击“整理素材”，系统会把小说、灵感或导入文本整理成短剧可用的梗概、节拍、角色和硬事实。
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg">故事素材</CardTitle>
          <CardDescription>用于后续策略、分集和台本生成的标准内容包。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">梗概</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{bundle.synopsis || "暂无梗概"}</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">设定要点</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{bundle.worldNotes || "暂无设定要点"}</p>
          </section>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">来源节拍</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[360px] space-y-2 overflow-auto">
            {beats.length > 0 ? beats.slice(0, 24).map((beat, index) => (
              <div key={index} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{compactText(beat.title || beat.summary || `节拍 ${index + 1}`)}</div>
                <div className="mt-1 text-muted-foreground">{compactText(beat.summary || beat.description || beat)}</div>
              </div>
            )) : <div className="text-sm text-muted-foreground">暂无来源节拍。</div>}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">硬事实</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {facts.length > 0 ? facts.slice(0, 12).map((fact, index) => (
              <div key={index} className="rounded-md border px-3 py-2 text-sm">
                {fact.text || compactText(fact)}
              </div>
            )) : <div className="text-sm text-muted-foreground">暂无硬事实。</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StrategyPanel({ project }: { project: DramaProjectDetail }) {
  const strategy = safeJson<Record<string, unknown>>(project.strategy, {});
  const entries = Object.entries(strategy);
  if (!project.strategy) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">还没有生成短剧策略。</div>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {entries.length > 0 ? entries.map(([key, value]) => (
        <Card key={key} className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">{key}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{compactText(value)}</pre>
          </CardContent>
        </Card>
      )) : (
        <Card className="rounded-lg">
          <CardContent className="pt-6">
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{project.strategy}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EpisodeCard(props: {
  episode: DramaEpisode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg border p-3 text-left text-sm transition ${props.selected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
      onClick={props.onSelect}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">第 {props.episode.order} 集</span>
        <Badge variant={props.episode.isPaywall ? "default" : "secondary"}>{props.episode.isPaywall ? "付费卡点" : "普通集"}</Badge>
        <Badge variant="outline">{statusLabel(props.episode.status)}</Badge>
      </div>
      <div className="mt-2 font-medium">{props.episode.title}</div>
      <div className="mt-1 line-clamp-2 text-muted-foreground">{props.episode.hookOpening || props.episode.cliffhanger || "暂无钩子信息"}</div>
    </button>
  );
}

function QualityFlags({ episode }: { episode: DramaEpisode }) {
  const quality = safeJson<Record<string, unknown>>(episode.qualityFlags, {});
  if (!episode.qualityFlags) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">还没有质量检查结果。</div>;
  }
  return (
    <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/20 p-4 text-xs leading-5">
      {JSON.stringify(quality, null, 2)}
    </pre>
  );
}

function EpisodesPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  onGenerateScript: (order: number) => void;
  onReview: (order: number) => void;
  onRepair: (order: number) => void;
  busy: boolean;
}) {
  const episodes = props.project.episodes ?? [];
  const selectedEpisode = episodes.find((episode) => episode.order === props.selectedOrder) ?? episodes[0];

  if (episodes.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">还没有分集大纲。先生成前 12 集分集。</div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            selected={selectedEpisode?.id === episode.id}
            onSelect={() => props.onSelectOrder(episode.order)}
          />
        ))}
      </div>
      {selectedEpisode ? (
        <Card className="rounded-lg">
          <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-lg">第 {selectedEpisode.order} 集：{selectedEpisode.title}</CardTitle>
              <CardDescription>{selectedEpisode.hookOpening || "本集尚未写入开场钩子。"}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="button" disabled={props.busy} onClick={() => props.onGenerateScript(selectedEpisode.order)}>
                <Wand2 className="h-4 w-4" />
                生成台本
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onReview(selectedEpisode.order)}>
                <CheckCircle2 className="h-4 w-4" />
                质量检查
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onRepair(selectedEpisode.order)}>
                <RefreshCw className="h-4 w-4" />
                修复
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3 text-sm">时长：{selectedEpisode.durationSec ?? "待生成"} 秒</div>
              <div className="rounded-md border p-3 text-sm">情绪净值：{selectedEpisode.emotionNet ?? "待生成"}</div>
              <div className="rounded-md border p-3 text-sm">状态：{statusLabel(selectedEpisode.status)}</div>
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">结尾卡点</h3>
              <p className="text-sm leading-6 text-muted-foreground">{selectedEpisode.cliffhanger || "暂无卡点"}</p>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">台本</h3>
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm leading-6">
                {selectedEpisode.content?.trim() || "还没有生成台本。"}
              </pre>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">质量结果</h3>
              <QualityFlags episode={selectedEpisode} />
            </section>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CharactersPanel({ project }: { project: DramaProjectDetail }) {
  const characters = project.characters ?? [];
  if (characters.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">还没有角色资源。整理素材后会自动导入主要角色。</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => (
        <Card key={character.id} className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">{character.name}</CardTitle>
            <CardDescription>{character.archetype || "未设置角色原型"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{character.persona || "暂无人设描述"}</p>
            <p>{character.speechStyle || "暂无说话风格"}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VisualPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  onStoryboard: (order: number) => void;
  onVideoPrompt: (shot: DramaShot) => void;
  onProviderTask: (prompt: DramaVideoPrompt) => void;
  busy: boolean;
}) {
  const episodes = props.project.episodes ?? [];
  const selectedEpisode = episodes.find((episode) => episode.order === props.selectedOrder) ?? episodes[0];
  const storyboards = selectedEpisode?.storyboards ?? [];
  const storyboard = storyboards[0] as DramaStoryboard | undefined;
  const promptsByShot = new Map((props.project.videoPrompts ?? []).filter((prompt) => prompt.shotId).map((prompt) => [prompt.shotId, prompt]));

  if (!selectedEpisode) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">先生成分集和台本，再进入分镜与视频提示词。</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={selectedEpisode.order}
          onChange={(event) => props.onSelectOrder(Number(event.target.value))}
        >
          {episodes.map((episode) => (
            <option key={episode.id} value={episode.order}>第 {episode.order} 集 {episode.title}</option>
          ))}
        </select>
        <Button type="button" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onStoryboard(selectedEpisode.order)}>
          <Film className="h-4 w-4" />
          生成分镜
        </Button>
      </div>
      {!storyboard ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">当前集还没有分镜。</div>
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">分镜</CardTitle>
            <CardDescription>{storyboard.summary || "已生成镜头序列。"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(storyboard.shots ?? []).map((shot) => {
              const prompt = promptsByShot.get(shot.id);
              return (
                <div key={shot.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">镜头 {shot.order} · {shot.shotSize || "景别待定"}</div>
                      <div className="text-sm text-muted-foreground">{shot.action}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" type="button" variant="outline" disabled={props.busy} onClick={() => props.onVideoPrompt(shot)}>
                        <Video className="h-4 w-4" />
                        视频提示词
                      </Button>
                      {prompt ? (
                        <Button size="sm" type="button" disabled={props.busy} onClick={() => props.onProviderTask(prompt)}>
                          <Sparkles className="h-4 w-4" />
                          创建视频任务
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {prompt ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs leading-5">{prompt.prompt}</pre>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DramaProjectPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DramaTab>("source");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(id ?? "none"),
    queryFn: () => getDramaProject(id!),
    enabled: Boolean(id),
  });

  const project = projectQuery.data?.data;
  const selectedOrderValue = useMemo(() => {
    if (selectedOrder) {
      return selectedOrder;
    }
    return project?.episodes?.[0]?.order ?? null;
  }, [project?.episodes, selectedOrder]);

  const invalidateProject = async () => {
    if (!id) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
  };

  const actionMutation = useMutation({
    mutationFn: async (input: { action: () => Promise<unknown>; message: string }) => {
      await input.action();
      return input.message;
    },
    onSuccess: async (message) => {
      await invalidateProject();
      toast.success(message);
    },
  });

  const runAction = (action: () => Promise<unknown>, message: string) => {
    actionMutation.mutate({ action, message });
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!project) {
      return;
    }
    const blob = await downloadDramaExport(project.id, format);
    downloadBlob(blob, `${project.title}-short-drama.${format === "json" ? "json" : "md"}`);
  };

  if (projectQuery.isLoading) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">正在加载短剧项目...</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/drama"><ArrowLeft className="h-4 w-4" />返回短剧工作台</Link>
        </Button>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">没有找到这个短剧项目。</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to="/drama"><ArrowLeft className="h-4 w-4" />短剧工作台</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">{project.title}</h1>
            <Badge variant="secondary">{statusLabel(project.status)}</Badge>
            <Badge variant="outline">{project.targetEpisodes} 集</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            按“素材 → 策略 → 分集 → 台本 → 质量 → 分镜视频”的顺序推进这部短剧。
          </p>
        </div>
        <Button type="button" variant="outline" disabled={projectQuery.isFetching} onClick={() => void projectQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <ProjectProgress project={project} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={actionMutation.isPending} onClick={() => runAction(() => assembleDramaSourceBundle(project.id), "短剧素材已整理。")}>
          <Layers3 className="h-4 w-4" />
          整理素材
        </Button>
        <Button type="button" variant="outline" disabled={actionMutation.isPending || !project.sourceBundle} onClick={() => runAction(() => generateDramaStrategy(project.id), "短剧策略已生成。")}>
          <Sparkles className="h-4 w-4" />
          生成策略
        </Button>
        <Button type="button" disabled={actionMutation.isPending || !project.strategy} onClick={() => runAction(() => generateDramaOutline(project.id, { startOrder: 1, count: 12 }), "前 12 集分集已生成。")}>
          <ListVideo className="h-4 w-4" />
          生成前 12 集
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={activeTab === tab.key ? "default" : "ghost"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "source" ? <SourcePanel project={project} /> : null}
      {activeTab === "strategy" ? <StrategyPanel project={project} /> : null}
      {activeTab === "episodes" ? (
        <EpisodesPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          busy={actionMutation.isPending}
          onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
          onReview={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
          onRepair={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        />
      ) : null}
      {activeTab === "characters" ? <CharactersPanel project={project} /> : null}
      {activeTab === "visual" ? (
        <VisualPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          busy={actionMutation.isPending}
          onStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
          onVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
          onProviderTask={(prompt) => runAction(() => createDramaVideoProviderTask(prompt.id), "视频任务已创建。")}
        />
      ) : null}
      {activeTab === "export" ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">导出短剧资料</CardTitle>
            <CardDescription>导出当前项目的角色、分集和已生成台本。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleExport("markdown")}>
              <Download className="h-4 w-4" />
              导出 Markdown
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleExport("json")}>
              <Download className="h-4 w-4" />
              导出 JSON
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
