import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones, RefreshCw } from "lucide-react";
import {
  estimateDramaEpisodeBatchJob,
  type DramaBatchCostBreakdown,
  type DramaBatchJob,
  type DramaBatchProgress,
  type DramaDialogueAudioData,
  type DramaEpisode,
  type DramaTTSProvider,
} from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SelectControl from "@/components/common/SelectControl";

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

function parseBatchProgress(raw: string | null | undefined): DramaBatchProgress {
  return safeJson<DramaBatchProgress>(raw, {
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    failedShotIds: [],
    errors: [],
  });
}

function parseAudioData(raw: string | null | undefined): DramaDialogueAudioData {
  return safeJson<DramaDialogueAudioData>(raw, { status: "idle", items: [] });
}

function isActiveBatch(job: DramaBatchJob | undefined): boolean {
  return job?.status === "pending" || job?.status === "running";
}

function batchStatusLabel(status: DramaBatchJob["status"]): string {
  const labels: Record<DramaBatchJob["status"], string> = {
    pending: t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_65dd9ef1"),
    running: t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_46e38679"),
    paused: t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_a2d930fd"),
    done: t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_fad5222c"),
    failed: t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_db57fa9a"),
  };
  return labels[status] ?? status;
}

export function DramaEpisodeAudioPanel(props: {
  projectId: string;
  episode: DramaEpisode;
  batchJobs?: DramaBatchJob[];
  ttsProviders: DramaTTSProvider[];
  busy: boolean;
  onBatchJob: (order: number, input: { type: "tts"; provider?: string; failedShotIds?: string[] }) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState("");
  const activeProvider = props.ttsProviders.some((provider) => provider.provider === selectedProvider)
    ? selectedProvider
    : props.ttsProviders[0]?.provider ?? "mock";
  const latestTtsBatch = props.batchJobs?.find((job) => job.episodeId === props.episode.id && job.type === "tts");
  const latestProgress = parseBatchProgress(latestTtsBatch?.progress);
  const ttsActive = isActiveBatch(latestTtsBatch);
  const hasStoryboardShots = Boolean(props.episode.storyboards?.[0]?.shots?.length);
  const estimateQuery = useQuery({
    queryKey: ["drama", "batch-estimate", props.projectId, props.episode.order, "tts", activeProvider],
    queryFn: () => estimateDramaEpisodeBatchJob(props.projectId, props.episode.order, {
      type: "tts",
      provider: activeProvider,
    }),
    enabled: hasStoryboardShots,
    staleTime: 30_000,
  });
  const audioItems = useMemo(() => {
    const storyboard = props.episode.storyboards?.[0];
    return (storyboard?.shots ?? []).flatMap((shot) => {
      const audio = parseAudioData(shot.dialogueAudioData);
      return (audio.items ?? []).map((item) => ({
        ...item,
        shotOrder: shot.order,
      }));
    });
  }, [props.episode.storyboards]);

  useEffect(() => {
    if (props.ttsProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(props.ttsProviders[0]!.provider);
    }
  }, [props.ttsProviders, selectedProvider]);

  const total = Math.max(0, latestProgress.total ?? 0);
  const done = Math.max(0, latestProgress.done ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const failedShotIds = latestProgress.failedShotIds ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_01ab0b75")}</h3>
        <div className="flex flex-wrap gap-2">
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-xs"
            value={activeProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
            aria-label={t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_292c4d35")}
          >
            {props.ttsProviders.length > 0 ? props.ttsProviders.map((provider) => (
              <option key={provider.provider} value={provider.provider}>{provider.label}</option>
            )) : (
              <option value="mock">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_d4f44c32")}</option>
            )}
          </SelectControl>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={props.busy || ttsActive || !hasStoryboardShots}
            onClick={() => props.onBatchJob(props.episode.order, { type: "tts", provider: activeProvider })}
          >
            <Headphones className="h-4 w-4" />
            合成本集配音
          </Button>
        </div>
      </div>
      <CostEstimate
        cost={estimateQuery.data?.data?.cost}
        loading={estimateQuery.isFetching}
      />

      {latestTtsBatch ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_7ea1157c")}</div>
            <Badge variant={latestTtsBatch.status === "failed" ? "destructive" : "outline"}>{batchStatusLabel(latestTtsBatch.status)}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{done}/{total}</span>
            {latestProgress.skipped ? <span>{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_a7434e57")}</span> : null}
            {latestProgress.failed ? <span>{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_21fbd353")}</span> : null}
            {latestProgress.provider ? <span>{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_d3892aff")}</span> : null}
            {latestProgress.cost ? <span>{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_8eb998f7")}</span> : null}
            {latestProgress.cost ? <span>{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_9c458f9e")}</span> : null}
          </div>
          {failedShotIds.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-destructive">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_1bb197a9")}</span>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={props.busy || ttsActive}
                onClick={() => props.onBatchJob(props.episode.order, {
                  type: "tts",
                  provider: activeProvider,
                  failedShotIds,
                })}
              >
                <RefreshCw className="h-4 w-4" />
                重试失败镜头
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {audioItems.length > 0 ? (
        <div className="space-y-2">
          {audioItems.map((item) => (
            <div key={`${item.shotOrder}-${item.lineIndex}`} className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_c694ea96")}</Badge>
                {item.speaker ? <span className="font-medium">{item.speaker}</span> : null}
                {item.voiceId ? <span className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_2a860e6f")}</span> : null}
              </div>
              <p className="mb-2 text-muted-foreground">{item.text}</p>
              <audio className="w-full" controls src={item.audioUrl} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_c98a47d7")}</div>
      )}
    </section>
  );
}

function formatCost(cost: DramaBatchCostBreakdown, amount: number): string {
  return `${cost.currency} ${amount.toFixed(2)}`;
}

function CostEstimate(props: { cost?: DramaBatchCostBreakdown; loading: boolean }) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <div className="text-xs text-muted-foreground">{t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_01641425")}</div>
      <div className="mt-1 font-medium">
        {props.loading ? t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_5930eaab") : props.cost ? formatCost(props.cost, props.cost.estimated) : t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_90675736")}
      </div>
      {props.cost ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {props.cost.unit.costPerSecond ? `时长 ${formatCost(props.cost, props.cost.unit.costPerSecond)}/秒` : t("gen.pages.drama.components.DramaEpisodeAudioPanel.gen_8690d6e2")}
          {props.cost.estimatedUnits.shots ? ` · ${props.cost.estimatedUnits.shots} 个镜头` : ""}
        </div>
      ) : null}
    </div>
  );
}
