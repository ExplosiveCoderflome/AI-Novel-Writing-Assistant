import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  RefreshCw,
  Save,
  Wand2,
} from "lucide-react";
import {
  assembleDramaSourceBundle,
  checkDramaProjectCompliance,
  createDramaEpisodeBatchJob,
  createDramaVideoProviderTask,
  downloadDramaEpisodeExport,
  downloadDramaExport,
  generateDramaEpisodeScript,
  generateDramaOutline,
  generateDramaStoryboard,
  generateDramaStrategy,
  generateDramaShotKeyframe,
  generateDramaVideoPrompt,
  getDramaProject,
  importDramaCharacterFromLibrary,
  listDramaCharacterLibrary,
  listDramaTTSProviders,
  listDramaVideoProviders,
  repairDramaEpisode,
  refreshDramaVideoProviderTask,
  reviewDramaEpisode,
  saveDramaCharacterToLibrary,
  type DramaBatchCostBreakdown,
  type DramaEpisodeExportFormat,
  type DramaEpisode,
  type DramaProjectDetail,
  updateDramaCharacter,
  updateDramaEpisode,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { DramaCharactersPanel } from "@/pages/drama/components/DramaCharactersPanel";
import { DramaEpisodeAudioPanel } from "@/pages/drama/components/DramaEpisodeAudioPanel";
import { DramaNextStepPanel } from "@/pages/drama/components/DramaNextStepPanel";
import { DramaQualityPanel } from "@/pages/drama/components/DramaQualityPanel";
import { DramaSourcePanel } from "@/pages/drama/components/DramaSourcePanel";
import { DramaVisualPanel } from "@/pages/drama/components/DramaVisualPanel";
import { dramaTrackLabel } from "@/pages/drama/dramaDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type DramaTab = "source" | "strategy" | "episodes" | "quality" | "characters" | "visual" | "export";

const TABS: Array<{ key: DramaTab; label: string }> = [
  { key: "source", label: t("gen.pages.drama.DramaProjectPage.gen_7603c3fa") },
  { key: "strategy", label: t("gen.pages.drama.DramaProjectPage.gen_52d331ad") },
  { key: "episodes", label: t("gen.pages.drama.DramaProjectPage.gen_43761fd1") },
  { key: "quality", label: t("gen.pages.drama.DramaProjectPage.gen_c440cdf7") },
  { key: "characters", label: t("gen.pages.drama.DramaProjectPage.gen_464f3d4e") },
  { key: "visual", label: t("gen.pages.drama.DramaProjectPage.gen_65fe78e5") },
  { key: "export", label: t("gen.pages.drama.DramaProjectPage.gen_55405ea6") },
];

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: t("gen.pages.drama.DramaProjectPage.gen_4f1e5fdf"),
    strategized: t("gen.pages.drama.DramaProjectPage.gen_301c0f79"),
    outlined: t("gen.pages.drama.DramaProjectPage.gen_e524427a"),
    scripting: t("gen.pages.drama.DramaProjectPage.gen_92bb42ba"),
    completed: t("gen.pages.drama.DramaProjectPage.gen_fad5222c"),
    planned: t("gen.pages.drama.DramaProjectPage.gen_26096aa1"),
    scripted: t("gen.pages.drama.DramaProjectPage.gen_2d4178b2"),
    reviewed: t("gen.pages.drama.DramaProjectPage.gen_2f9815ee"),
    needs_repair: t("gen.pages.drama.DramaProjectPage.gen_cba971a5"),
    approved: t("gen.pages.drama.DramaProjectPage.gen_ecfa64c1"),
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

const STRATEGY_LABELS: Record<string, string> = {
  positioning: t("gen.pages.drama.DramaProjectPage.gen_4603042d"),
  mainPleasureLine: t("gen.pages.drama.DramaProjectPage.mainSensationalLine"),
  paywallNote: t("gen.pages.drama.DramaProjectPage.paypointPlanning"),
  paywallPlan: t("gen.pages.drama.DramaProjectPage.paypointPlan"),
  emotionCurveNote: t("gen.pages.drama.DramaProjectPage.gen_7319f019"),
  deviationDeclaration: t("gen.pages.drama.DramaProjectPage.gen_3a83f897"),
};

const SCORE_LABELS: Record<string, string> = {
  hook: t("gen.pages.drama.DramaProjectPage.gen_9f6b97f2"),
  density: t("gen.pages.drama.DramaProjectPage.gen_e10fbbcf"),
  paywall: t("gen.pages.drama.DramaProjectPage.paypoint"),
  emotion: t("gen.pages.drama.DramaProjectPage.gen_7319f019"),
  duration: t("gen.pages.drama.DramaProjectPage.gen_5bdfd7ee"),
  consistency: t("gen.pages.drama.DramaProjectPage.consistency"),
  overall: t("gen.pages.drama.DramaProjectPage.gen_88e7de9f"),
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readBatchCost(raw: string | null | undefined): DramaBatchCostBreakdown | null {
  const parsed = safeJson<{ cost?: DramaBatchCostBreakdown }>(raw, {});
  return parsed.cost ?? null;
}

function summarizeBatchCosts(project: DramaProjectDetail): DramaBatchCostBreakdown | null {
  const costs = (project.batchJobs ?? [])
    .map((job) => readBatchCost(job.progress))
    .filter((cost): cost is DramaBatchCostBreakdown => Boolean(cost));
  if (!costs.length) {
    return null;
  }
  const currency = costs[0]?.currency ?? "CNY";
  return {
    currency,
    estimated: costs.reduce((sum, cost) => sum + (cost.estimated ?? 0), 0),
    actual: costs.reduce((sum, cost) => sum + (cost.actual ?? 0), 0),
    estimatedUnits: {},
    actualUnits: {},
    unit: {},
  };
}

function formatBatchCost(cost: DramaBatchCostBreakdown, amount: number): string {
  return `${cost.currency} ${amount.toFixed(2)}`;
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
    { label: t("gen.pages.drama.DramaProjectPage.gen_0e5dcce8"), done: hasBundle },
    { label: t("gen.pages.drama.DramaProjectPage.gen_66914536"), done: hasStrategy },
    { label: t("gen.pages.drama.DramaProjectPage.gen_f3a30b06"), done: episodeCount > 0 },
    { label: t("gen.pages.drama.DramaProjectPage.gen_4b8c5856"), done: scriptedCount > 0 },
    { label: t("gen.pages.drama.DramaProjectPage.gen_3a7170b9"), done: reviewedCount > 0 },
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

function StrategyPanel({ project }: { project: DramaProjectDetail }) {
  const strategy = safeJson<Record<string, unknown>>(project.strategy, {});
  const entries = Object.entries(strategy);
  if (!project.strategy) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_db795607")}</div>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {entries.length > 0 ? entries.map(([key, value]) => (
        <Card key={key} className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">{STRATEGY_LABELS[key] ?? key}</CardTitle>
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
        <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_e56b4c42")}</span>
        <Badge variant={props.episode.isPaywall ? "default" : "secondary"}>{t("gen.pages.drama.DramaProjectPage.episodeTypeText")}</Badge>
        <Badge variant="outline">{statusLabel(props.episode.status)}</Badge>
      </div>
      <div className="mt-2 font-medium">{props.episode.title}</div>
      <div className="mt-1 line-clamp-2 text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.episodeHookInfo")}</div>
    </button>
  );
}

function QualityFlags({ episode }: { episode: DramaEpisode }) {
  const quality = safeJson<{
    status?: string;
    score?: Record<string, number>;
    flags?: Array<{ severity?: string; code?: string; evidence?: string; suggestion?: string }>;
    repairPlan?: { mode?: string; instruction?: string };
  }>(episode.qualityFlags, {});
  if (!episode.qualityFlags) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_9a90ec0d")}</div>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={quality.status === "approved" ? "default" : "secondary"}>{t("gen.pages.drama.DramaProjectPage.qualityStatus")}</Badge>
        {quality.score?.overall != null ? <span className="text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_9c39249b")}</span> : null}
      </div>
      {quality.score ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(quality.score).map(([key, value]) => (
            <div key={key} className="rounded-md border px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">{SCORE_LABELS[key] ?? key}</div>
              <div className="mt-1 font-medium">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {quality.flags?.length ? (
        <div className="space-y-2">
          {quality.flags.map((flag, index) => (
            <div key={`${flag.code ?? "flag"}-${index}`} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{flag.severity || "notice"}</Badge>
                <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.qualityHint")}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{flag.evidence}</p>
              <p className="mt-1">{flag.suggestion}</p>
            </div>
          ))}
        </div>
      ) : null}
      {quality.repairPlan?.instruction ? (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <div className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_c94222f6")}</div>
          <p className="mt-1 text-muted-foreground">{quality.repairPlan.instruction}</p>
        </div>
      ) : null}
    </div>
  );
}

function EpisodesPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  ttsProviders: Array<{ provider: string; label: string; description?: string }>;
  onBatchJob: (order: number, input: { type: "tts"; provider?: string; failedShotIds?: string[] }) => void;
  onGenerateScript: (order: number) => void;
  onReview: (order: number) => void;
  onRepair: (order: number) => void;
  onSave: (order: number, input: { title: string; hookOpening: string; cliffhanger: string; content: string; durationSec: string }) => void;
  busy: boolean;
}) {
  const episodes = props.project.episodes ?? [];
  const selectedEpisode = episodes.find((episode) => episode.order === props.selectedOrder) ?? episodes[0];
  const [draft, setDraft] = useState({
    title: "",
    hookOpening: "",
    cliffhanger: "",
    content: "",
    durationSec: "",
  });

  useEffect(() => {
    setDraft({
      title: selectedEpisode?.title ?? "",
      hookOpening: selectedEpisode?.hookOpening ?? "",
      cliffhanger: selectedEpisode?.cliffhanger ?? "",
      content: selectedEpisode?.content ?? "",
      durationSec: selectedEpisode?.durationSec != null ? String(selectedEpisode.durationSec) : "",
    });
  }, [selectedEpisode?.id, selectedEpisode?.title, selectedEpisode?.hookOpening, selectedEpisode?.cliffhanger, selectedEpisode?.content, selectedEpisode?.durationSec]);

  if (episodes.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_e9444130")}</div>;
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
              <CardTitle className="text-lg">{t("gen.pages.drama.DramaProjectPage.gen_dee4db5a")}</CardTitle>
              <CardDescription>{t("gen.pages.drama.DramaProjectPage.episodeHookInfo")}</CardDescription>
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
              <Button size="sm" type="button" variant="outline" disabled={props.busy} onClick={() => props.onSave(selectedEpisode.order, draft)}>
                <Save className="h-4 w-4" />
                保存编辑
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3 text-sm">{t("gen.pages.drama.DramaProjectPage.gen_43d02768")}</div>
              <div className="rounded-md border p-3 text-sm">{t("gen.pages.drama.DramaProjectPage.gen_4f841e96")}</div>
              <div className="rounded-md border p-3 text-sm">{t("gen.pages.drama.DramaProjectPage.gen_afe6fc74")}</div>
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("gen.pages.drama.DramaProjectPage.gen_d55cd5b3")}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_32c65d8d")}</span>
                  <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_8b6c763f")}</span>
                  <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.durationSec} onChange={(event) => setDraft((current) => ({ ...current, durationSec: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm lg:col-span-2">
                  <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_9f6b97f2")}</span>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.hookOpening} onChange={(event) => setDraft((current) => ({ ...current, hookOpening: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm lg:col-span-2">
                  <span className="font-medium">{t("gen.pages.drama.DramaProjectPage.gen_ec0df7dc")}</span>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.cliffhanger} onChange={(event) => setDraft((current) => ({ ...current, cliffhanger: event.target.value }))} />
                </label>
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("gen.pages.drama.DramaProjectPage.gen_4b8c5856")}</h3>
              <textarea
                className="min-h-[420px] w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
                value={draft.content}
                placeholder={t("gen.pages.drama.DramaProjectPage.gen_1ed55da4")}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("gen.pages.drama.DramaProjectPage.gen_f93391e5")}</h3>
              <QualityFlags episode={selectedEpisode} />
            </section>
            <DramaEpisodeAudioPanel
              projectId={props.project.id}
              episode={selectedEpisode}
              batchJobs={props.project.batchJobs}
              ttsProviders={props.ttsProviders}
              busy={props.busy}
              onBatchJob={props.onBatchJob}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function DramaProjectPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DramaTab>("source");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [selectedVideoProvider, setSelectedVideoProvider] = useState("mock");

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(id ?? "none"),
    queryFn: () => getDramaProject(id!),
    enabled: Boolean(id),
  });
  const characterLibraryQuery = useQuery({
    queryKey: queryKeys.drama.characterLibrary(id),
    queryFn: () => listDramaCharacterLibrary(id),
    enabled: Boolean(id),
  });
  const videoProvidersQuery = useQuery({
    queryKey: queryKeys.drama.videoProviders,
    queryFn: listDramaVideoProviders,
  });
  const ttsProvidersQuery = useQuery({
    queryKey: queryKeys.drama.ttsProviders,
    queryFn: listDramaTTSProviders,
  });

  const project = projectQuery.data?.data;
  const videoProviders = videoProvidersQuery.data?.data ?? [];
  const ttsProviders = ttsProvidersQuery.data?.data ?? [];
  const activeVideoProvider = videoProviders.some((provider) => provider.provider === selectedVideoProvider)
    ? selectedVideoProvider
    : videoProviders[0]?.provider ?? "mock";
  const selectedOrderValue = useMemo(() => {
    if (selectedOrder) {
      return selectedOrder;
    }
    return project?.episodes?.[0]?.order ?? null;
  }, [project?.episodes, selectedOrder]);
  const batchCostSummary = project ? summarizeBatchCosts(project) : null;

  const invalidateProject = async () => {
    if (!id) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.characterLibrary(id) });
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
    return actionMutation.mutateAsync({ action, message });
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!project) {
      return;
    }
    const blob = await downloadDramaExport(project.id, format);
    downloadBlob(blob, `${project.title}-short-drama.${format === "json" ? "json" : "md"}`);
  };

  const handleEpisodeExport = async (order: number, format: DramaEpisodeExportFormat) => {
    if (!project) {
      return;
    }
    const blob = await downloadDramaEpisodeExport(project.id, order, format);
    const suffix = format === "timeline-json" ? "timeline.json" : "srt";
    downloadBlob(blob, `${project.title}-E${order}.${suffix}`);
  };

  const handleSaveEpisode = (order: number, input: {
    title: string;
    hookOpening: string;
    cliffhanger: string;
    content: string;
    durationSec: string;
  }) => {
    if (!project) {
      return;
    }
    const durationSec = input.durationSec.trim() ? Number(input.durationSec) : undefined;
    if (!input.title.trim()) {
      toast.error(t("gen.pages.drama.DramaProjectPage.gen_05ee2264"));
      return;
    }
    runAction(
      () => updateDramaEpisode(project.id, order, {
        title: input.title.trim(),
        hookOpening: input.hookOpening.trim() || null,
        cliffhanger: input.cliffhanger.trim() || null,
        content: input.content,
        durationSec: durationSec !== undefined && Number.isFinite(durationSec) ? durationSec : null,
      }),
      `第 ${order} 集已保存。`,
    );
  };

  if (projectQuery.isLoading) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_c5b9ca5a")}</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/drama"><ArrowLeft className="h-4 w-4" />{t("gen.pages.drama.DramaProjectPage.gen_74397600")}</Link>
        </Button>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("gen.pages.drama.DramaProjectPage.gen_8b5930d2")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to="/drama"><ArrowLeft className="h-4 w-4" />{t("gen.pages.drama.DramaProjectPage.gen_8eb337a1")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">{project.title}</h1>
            <Badge variant="secondary">{statusLabel(project.status)}</Badge>
            <Badge variant="outline">{dramaTrackLabel(project.track)}</Badge>
            <Badge variant="outline">{t("gen.pages.drama.DramaProjectPage.targetEpisodes")}</Badge>
            {batchCostSummary ? (
              <Badge variant="outline">
                生产费用：已用 {formatBatchCost(batchCostSummary, batchCostSummary.actual)} / 预计 {formatBatchCost(batchCostSummary, batchCostSummary.estimated)}
              </Badge>
            ) : null}
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

      <DramaNextStepPanel
        project={project}
        busy={actionMutation.isPending}
        onSetTab={setActiveTab}
        onSelectEpisode={setSelectedOrder}
        onAssembleSource={() => runAction(() => assembleDramaSourceBundle(project.id), t("gen.pages.drama.DramaProjectPage.gen_971fac72"))}
        onGenerateStrategy={() => runAction(() => generateDramaStrategy(project.id), t("gen.pages.drama.DramaProjectPage.gen_45be5534"))}
        onGenerateOutline={() => runAction(() => generateDramaOutline(project.id, { startOrder: 1, count: 12 }), t("gen.pages.drama.DramaProjectPage.gen_b1c454f5"))}
        onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
        onReviewEpisode={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
        onRepairEpisode={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        onGenerateStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
        onGenerateVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
        onCreateProviderTask={(prompt) => runAction(() => createDramaVideoProviderTask(prompt.id, activeVideoProvider), t("gen.pages.drama.DramaProjectPage.gen_787d2d5a"))}
        onExportMarkdown={() => void handleExport("markdown")}
      />

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

      {activeTab === "source" ? <DramaSourcePanel project={project} /> : null}
      {activeTab === "strategy" ? <StrategyPanel project={project} /> : null}
      {activeTab === "episodes" ? (
        <EpisodesPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          ttsProviders={ttsProviders}
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), t("gen.pages.drama.DramaProjectPage.gen_213ca205"))}
          busy={actionMutation.isPending}
          onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
          onReview={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
          onRepair={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
          onSave={handleSaveEpisode}
        />
      ) : null}
      {activeTab === "quality" ? (
        <DramaQualityPanel
          project={project}
          busy={actionMutation.isPending}
          onSelectEpisode={setSelectedOrder}
          onOpenEpisodes={() => setActiveTab("episodes")}
          onReview={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
          onComplianceAll={() => runAction(() => checkDramaProjectCompliance(project.id), t("gen.pages.drama.DramaProjectPage.gen_603ed7bb"))}
          onRepair={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        />
      ) : null}
      {activeTab === "characters" ? (
        <DramaCharactersPanel
          project={project}
          library={characterLibraryQuery.data?.data ?? []}
          busy={actionMutation.isPending}
          onSave={(character, input) => {
            if (!input.name.trim()) {
              toast.error(t("gen.pages.drama.DramaProjectPage.gen_9bce50fe"));
              return;
            }
            runAction(
              () => updateDramaCharacter(project.id, character.id, {
                name: input.name.trim(),
                archetype: input.screenRole.trim() || undefined,
                persona: input.audienceRead.trim() || undefined,
                speechStyle: input.lineRule.trim() || undefined,
                visualAnchor: input.visualAnchor.trim() || undefined,
                voiceProfile: input.voiceAnchor.trim() || undefined,
                relations: input.relationMap.trim() || undefined,
              }),
              `${input.name || character.name} 已保存。`,
            );
          }}
          onSaveToLibrary={(character) => runAction(
            () => saveDramaCharacterToLibrary(project.id, character.id),
            `${character.name} 已保存到角色库。`,
          )}
          onImportFromLibrary={(libraryId) => runAction(
            () => importDramaCharacterFromLibrary(project.id, libraryId),
            t("gen.pages.drama.DramaProjectPage.gen_db2e1373"),
          )}
          onRefreshProject={() => void projectQuery.refetch()}
        />
      ) : null}
      {activeTab === "visual" ? (
        <DramaVisualPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          busy={actionMutation.isPending}
          onStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), t("gen.pages.drama.DramaProjectPage.gen_a2471e35"))}
          onKeyframe={(shot, provider, useCharacterRefImages, overrides) => runAction(() => generateDramaShotKeyframe(project.id, shot.id, provider, useCharacterRefImages, overrides), `镜头 ${shot.order} 的首帧图已生成。`)}
          onVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
          videoProviders={videoProviders}
          selectedProvider={activeVideoProvider}
          onSelectProvider={setSelectedVideoProvider}
          onProviderTask={(prompt, provider) => runAction(() => createDramaVideoProviderTask(prompt.id, provider), t("gen.pages.drama.DramaProjectPage.gen_787d2d5a"))}
          onRefreshProviderTask={(prompt) => runAction(() => refreshDramaVideoProviderTask(prompt.id), t("gen.pages.drama.DramaProjectPage.gen_c6b9b927"))}
        />
      ) : null}
      {activeTab === "export" ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">{t("gen.pages.drama.DramaProjectPage.gen_57b3094d")}</CardTitle>
            <CardDescription>{t("gen.pages.drama.DramaProjectPage.gen_dee0d3a0")}</CardDescription>
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
            {selectedOrderValue ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "srt")}>
                  <Download className="h-4 w-4" />
                  导出本集 SRT
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "timeline-json")}>
                  <Download className="h-4 w-4" />
                  导出剪辑草稿
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
