import { useEffect, useMemo, useState } from "react";
import { Headphones, RefreshCw } from "lucide-react";
import type {
  DramaBatchJob,
  DramaBatchProgress,
  DramaDialogueAudioData,
  DramaEpisode,
  DramaTTSProvider,
} from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    pending: "等待中",
    running: "执行中",
    paused: "已暂停",
    done: "已完成",
    failed: "有失败项",
  };
  return labels[status] ?? status;
}

export function DramaEpisodeAudioPanel(props: {
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
        <h3 className="text-sm font-medium">配音</h3>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-xs"
            value={activeProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
            aria-label="配音通道"
          >
            {props.ttsProviders.length > 0 ? props.ttsProviders.map((provider) => (
              <option key={provider.provider} value={provider.provider}>{provider.label}</option>
            )) : (
              <option value="mock">模拟配音通道</option>
            )}
          </select>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={props.busy || ttsActive || !props.episode.storyboards?.[0]?.shots?.length}
            onClick={() => props.onBatchJob(props.episode.order, { type: "tts", provider: activeProvider })}
          >
            <Headphones className="h-4 w-4" />
            合成本集配音
          </Button>
        </div>
      </div>

      {latestTtsBatch ? (
        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">本集配音任务</div>
            <Badge variant={latestTtsBatch.status === "failed" ? "destructive" : "outline"}>{batchStatusLabel(latestTtsBatch.status)}</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{done}/{total}</span>
            {latestProgress.skipped ? <span>已跳过 {latestProgress.skipped}</span> : null}
            {latestProgress.failed ? <span>失败 {latestProgress.failed}</span> : null}
            {latestProgress.provider ? <span>通道：{latestProgress.provider}</span> : null}
          </div>
          {failedShotIds.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-destructive">失败镜头：{failedShotIds.join("、")}</span>
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
                <Badge variant="secondary">镜头 {item.shotOrder}</Badge>
                {item.speaker ? <span className="font-medium">{item.speaker}</span> : null}
                {item.voiceId ? <span className="text-xs text-muted-foreground">声线：{item.voiceId}</span> : null}
              </div>
              <p className="mb-2 text-muted-foreground">{item.text}</p>
              <audio className="w-full" controls src={item.audioUrl} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">生成分镜后可合成本集配音。</div>
      )}
    </section>
  );
}
