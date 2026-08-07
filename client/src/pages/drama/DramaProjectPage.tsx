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
  { key: "source", label: "Source material" },
  { key: "strategy", label: "skit strategy" },
  { key: "episodes", label: "Episode script" },
  { key: "quality", label: "quality issues" },
  { key: "characters", label: "Role" },
  { key: "visual", label: "Storyboard video" },
  { key: "export", label: "Export" },
];

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Material preparation",
    strategized: "Policy has been generated",
    outlined: "Episode has been generated",
    scripting: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    completed: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    planned: "Script to be generated",
    scripted: "The script has been generated",
    reviewed: "Checked",
    needs_repair: "Needs repair",
    approved: "Passed",
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
  positioning: "Audience positioning",
  mainPleasureLine: "Main point line",
  paywallNote: "Pay card point planning",
  paywallPlan: "Paid card points plan",
  emotionCurveNote: "sentiment curve",
  deviationDeclaration: "Adaptation Boundary",
};

const SCORE_LABELS: Record<string, string> = {
  hook: "opening hook",
  density: "Information Density",
  paywall: "Pay card points",
  emotion: "sentiment curve",
  duration: "duration",
  consistency: "consistency",
  overall: "comprehensive",
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
    { label: "Material package", done: hasBundle },
    { label: "Strategy", done: hasStrategy },
    { label: "Diversity", done: episodeCount > 0 },
    { label: "script", done: scriptedCount > 0 },
    { label: "quality", done: reviewedCount > 0 },
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
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">There is no skit strategy generated yet.</div>;
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
        <span className="font-medium">Section {props.episode.order} set</span>
        <Badge variant={props.episode.isPaywall ? "default" : "secondary"}>{props.episode.isPaywall ? "Pay card points" : "Ordinary set"}</Badge>
        <Badge variant="outline">{statusLabel(props.episode.status)}</Badge>
      </div>
      <div className="mt-2 font-medium">{props.episode.title}</div>
      <div className="mt-1 line-clamp-2 text-muted-foreground">{props.episode.hookOpening || props.episode.cliffhanger || "No hook information yet"}</div>
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
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No QA results yet.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={quality.status === "approved" ? "default" : "secondary"}>{quality.status || "Checked"}</Badge>
        {quality.score?.overall != null ? <span className="text-sm text-muted-foreground">comprehensive {quality.score.overall}</span> : null}
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
                <span className="font-medium">{flag.code || "Quality Tips"}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{flag.evidence}</p>
              <p className="mt-1">{flag.suggestion}</p>
            </div>
          ))}
        </div>
      ) : null}
      {quality.repairPlan?.instruction ? (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <div className="font-medium">Suggested fixes</div>
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
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No episode outline yet. First generate the first 12 episodes.</div>;
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
              <CardTitle className="text-lg">Section {selectedEpisode.order} set:{selectedEpisode.title}</CardTitle>
              <CardDescription>{selectedEpisode.hookOpening || "本集尚未写入开场钩子。"}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="button" disabled={props.busy} onClick={() => props.onGenerateScript(selectedEpisode.order)}>
                <Wand2 className="h-4 w-4" />
                Generate script
                                            </Button>
              <Button size="sm" type="button" variant="outline" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onReview(selectedEpisode.order)}>
                <CheckCircle2 className="h-4 w-4" />
                Quality check
                                            </Button>
              <Button size="sm" type="button" variant="outline" disabled={props.busy || !selectedEpisode.content?.trim()} onClick={() => props.onRepair(selectedEpisode.order)}>
                <RefreshCw className="h-4 w-4" />
                repair
                                            </Button>
              <Button size="sm" type="button" variant="outline" disabled={props.busy} onClick={() => props.onSave(selectedEpisode.order, draft)}>
                <Save className="h-4 w-4" />
                Save edits
                                            </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3 text-sm">Duration:{selectedEpisode.durationSec ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."} Second</div>
              <div className="rounded-md border p-3 text-sm">Emotional net worth:{selectedEpisode.emotionNet ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</div>
              <div className="rounded-md border p-3 text-sm">state:{statusLabel(selectedEpisode.status)}</div>
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Information about this episode</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</span>
                  <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">Estimated duration (seconds)</span>
                  <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.durationSec} onChange={(event) => setDraft((current) => ({ ...current, durationSec: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm lg:col-span-2">
                  <span className="font-medium">opening hook</span>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.hookOpening} onChange={(event) => setDraft((current) => ({ ...current, hookOpening: event.target.value }))} />
                </label>
                <label className="block space-y-1.5 text-sm lg:col-span-2">
                  <span className="font-medium">Stuck point at the end</span>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.cliffhanger} onChange={(event) => setDraft((current) => ({ ...current, cliffhanger: event.target.value }))} />
                </label>
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">script</h3>
              <textarea
                className="min-h-[420px] w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
                value={draft.content}
                placeholder="The script has not been generated yet. It can be generated first or written manually."
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">quality results</h3>
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
      toast.error("Please fill in the title of this episode.");
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
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading short drama project...</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/drama"><ArrowLeft className="h-4 w-4" />Return to short drama workbench</Link>
        </Button>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">This short play item was not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to="/drama"><ArrowLeft className="h-4 w-4" />Short drama workbench</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">{project.title}</h1>
            <Badge variant="secondary">{statusLabel(project.status)}</Badge>
            <Badge variant="outline">{dramaTrackLabel(project.track)}</Badge>
            <Badge variant="outline">{project.targetEpisodes} set</Badge>
            {batchCostSummary ? (
              <Badge variant="outline">
                Production expenses: used {formatBatchCost(batchCostSummary, batchCostSummary.actual)} / expected {formatBatchCost(batchCostSummary, batchCostSummary.estimated)}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Advance this short drama in the order of "Material → Strategy → Episode → Script → Quality → Storyboard Video".
                                </p>
        </div>
        <Button type="button" variant="outline" disabled={projectQuery.isFetching} onClick={() => void projectQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          refresh
                          </Button>
      </div>

      <ProjectProgress project={project} />

      <DramaNextStepPanel
        project={project}
        busy={actionMutation.isPending}
        onSetTab={setActiveTab}
        onSelectEpisode={setSelectedOrder}
        onAssembleSource={() => runAction(() => assembleDramaSourceBundle(project.id), "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")}
        onGenerateStrategy={() => runAction(() => generateDramaStrategy(project.id), "Skit strategy generated.")}
        onGenerateOutline={() => runAction(() => generateDramaOutline(project.id, { startOrder: 1, count: 12 }), "The first 12 episodes have been produced.")}
        onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
        onReviewEpisode={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
        onRepairEpisode={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        onGenerateStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
        onGenerateVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
        onCreateProviderTask={(prompt) => runAction(() => createDramaVideoProviderTask(prompt.id, activeVideoProvider), "Video task has been created.")}
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
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), "Voice over task created.")}
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
          onComplianceAll={() => runAction(() => checkDramaProjectCompliance(project.id), "Compliance pre-check completed.")}
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
              toast.error("Please fill in the character name.");
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
            "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
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
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), "Batch task has been created.")}
          onKeyframe={(shot, provider, useCharacterRefImages, overrides) => runAction(() => generateDramaShotKeyframe(project.id, shot.id, provider, useCharacterRefImages, overrides), `镜头 ${shot.order} 的首帧图已生成。`)}
          onVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
          videoProviders={videoProviders}
          selectedProvider={activeVideoProvider}
          onSelectProvider={setSelectedVideoProvider}
          onProviderTask={(prompt, provider) => runAction(() => createDramaVideoProviderTask(prompt.id, provider), "Video task has been created.")}
          onRefreshProviderTask={(prompt) => runAction(() => refreshDramaVideoProviderTask(prompt.id), "Video task status has been refreshed.")}
        />
      ) : null}
      {activeTab === "export" ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">Export skit data</CardTitle>
            <CardDescription>Export the characters, episodes and generated scripts of the current project.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleExport("markdown")}>
              <Download className="h-4 w-4" />
              Export Markdown
                                      </Button>
            <Button type="button" variant="outline" onClick={() => void handleExport("json")}>
              <Download className="h-4 w-4" />
              Export JSON
                                      </Button>
            {selectedOrderValue ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "srt")}>
                  <Download className="h-4 w-4" />
                  Export this episode SRT
                                                  </Button>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "timeline-json")}>
                  <Download className="h-4 w-4" />
                  Export draft clip
                                                  </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
