import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MarketInfluenceMode,
  MarketRadarPlatform,
  MarketRadarSignal,
  MarketTrendReport,
} from "@ai-novel/shared/types/marketRadar";
import { ArrowRight, ExternalLink, Loader2, Radar, RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createMarketCreativeBrief,
  getLatestMarketRadarReport,
  getMarketRadarScan,
  getMarketRadarSources,
  startMarketRadarScan,
} from "@/api/marketRadar";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PLATFORM_LABELS: Record<MarketRadarPlatform, string> = {
  fanqie: "番茄小说",
  qidian: "起点中文网",
  jinjiang: "晋江文学城",
};

const KIND_LABELS: Record<MarketRadarSignal["kind"], string> = {
  genre: "热门题材",
  protagonist: "主角身份",
  advantage: "金手指",
  opening: "开局爆点",
  relationship: "关系卖点",
  title_pattern: "标题句式",
  opportunity: "差异化机会",
  crowding: "拥挤套路",
};

const MODE_LABELS: Record<MarketInfluenceMode, string> = {
  follow_hot: "跟随热门",
  differentiate: "热门中求差异",
  light: "弱化市场",
};

function recommendedSignalIds(report: MarketTrendReport): string[] {
  const recommended = report.signals.filter((signal) => signal.recommended);
  const opportunity = recommended.find((signal) => signal.kind === "opportunity");
  return [opportunity, ...recommended.filter((signal) => signal.id !== opportunity?.id)]
    .filter(Boolean).slice(0, 4).map((signal) => signal!.id);
}

export default function MarketRadarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [platforms, setPlatforms] = useState<MarketRadarPlatform[]>(["fanqie", "qidian", "jinjiang"]);
  const [activeRunId, setActiveRunId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [influenceMode, setInfluenceMode] = useState<MarketInfluenceMode>("differentiate");

  const sourcesQuery = useQuery({ queryKey: queryKeys.marketRadar.sources, queryFn: getMarketRadarSources });
  const latestQuery = useQuery({ queryKey: queryKeys.marketRadar.latest, queryFn: getLatestMarketRadarReport });
  const scanQuery = useQuery({
    queryKey: queryKeys.marketRadar.scan(activeRunId || "none"),
    queryFn: () => getMarketRadarScan(activeRunId),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });
  const activeRun = scanQuery.data?.data ?? null;
  const report = activeRun?.report ?? latestQuery.data?.data ?? null;

  useEffect(() => {
    if (!report) return;
    setSelectedIds((current) => current.length > 0 ? current : recommendedSignalIds(report));
  }, [report?.id]);

  useEffect(() => {
    if (!activeRun || (activeRun.status !== "succeeded" && activeRun.status !== "partial")) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.marketRadar.latest });
  }, [activeRun?.status, queryClient]);

  const scanMutation = useMutation({
    mutationFn: () => startMarketRadarScan(platforms),
    onSuccess: (response) => {
      const run = response.data;
      if (!run) return;
      setActiveRunId(run.id);
      if (run.report) setSelectedIds(recommendedSignalIds(run.report));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "扫榜失败，请稍后重试。"),
  });
  const briefMutation = useMutation({
    mutationFn: () => createMarketCreativeBrief({ reportId: report!.id, signalIds: selectedIds, influenceMode }),
    onSuccess: (response) => {
      if (response.data) navigate(`/novels/auto-director?marketBriefId=${encodeURIComponent(response.data.id)}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "生成市场创作简报失败。"),
  });

  const evidenceById = useMemo(() => new Map((report?.evidenceItems ?? []).map((item) => [item.id, item])), [report]);
  const scanning = scanMutation.isPending || activeRun?.status === "queued" || activeRun?.status === "running";

  const togglePlatform = (platform: MarketRadarPlatform) => {
    setPlatforms((current) => current.includes(platform)
      ? current.length === 1 ? current : current.filter((item) => item !== platform)
      : [...current, platform]);
  };
  const toggleSignal = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 5) { toast.error("最多选择5项市场信号。"); return current; }
      return [...current, id];
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Radar className="h-4 w-4" />热门题材雷达</div>
          <h1 className="text-3xl font-semibold tracking-tight">先看市场，再让 AI 第一次就选对方向</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">分析公开榜单里的题材、金手指、开局和标题模式，只提炼读者需求，不抓取小说正文，也不会照搬具体作品。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <button key={key} type="button" onClick={() => togglePlatform(key as MarketRadarPlatform)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", platforms.includes(key as MarketRadarPlatform) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{label}</button>
          ))}
          <Button onClick={() => scanMutation.mutate()} disabled={scanning || sourcesQuery.isPending}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? `正在扫榜 ${Math.round((activeRun?.progress ?? 0) * 100)}%` : report ? "重新扫榜" : "立即扫榜"}
          </Button>
        </div>
      </div>

      {activeRun?.platformStatuses.some((item) => item.status !== "succeeded") ? (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/15"><CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">部分榜单暂时无法读取，报告会使用成功数据继续分析：{activeRun.platformStatuses.filter((item) => item.status !== "succeeded").map((item) => `${PLATFORM_LABELS[item.platform]}：${item.error || "读取失败"}`).join("；")}</CardContent></Card>
      ) : null}
      {activeRun?.status === "failed" ? (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">本次扫榜未完成：{activeRun.lastError || "没有取得可分析的公开榜单数据。"} 最近一次成功报告仍保留在下方。</CardContent></Card>
      ) : null}

      {!report ? (
        <Card className="border-dashed"><CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center"><Radar className="h-10 w-10 text-muted-foreground" /><div className="font-medium">还没有市场快照</div><p className="max-w-lg text-sm text-muted-foreground">点击“立即扫榜”，AI 会把三个平台的公开排行榜整理成可直接用于开书的市场机会。</p></CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-xl">本期判断</CardTitle><CardDescription>采集于 {new Date(report.createdAt).toLocaleString()}，结论均可回看公开榜单证据。</CardDescription></CardHeader>
            <CardContent><p className="leading-7">{report.summary}</p><div className="mt-4 flex flex-wrap gap-2">{report.platformStatuses.map((status) => <Badge key={status.platform} variant={status.status === "failed" ? "destructive" : "outline"}>{PLATFORM_LABELS[status.platform]} · {status.itemCount}项{status.status === "stale" ? " · 建议刷新" : ""}</Badge>)}</div></CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {report.signals.map((signal) => {
              const selected = selectedIds.includes(signal.id);
              return <article key={signal.id} className={cn("rounded-xl border p-5 text-left transition hover:border-primary/50 hover:shadow-sm", selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card")}>
                <button type="button" aria-pressed={selected} onClick={() => toggleSignal(signal.id)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3"><Badge variant={signal.kind === "opportunity" ? "default" : signal.kind === "crowding" ? "destructive" : "secondary"}>{KIND_LABELS[signal.kind]}</Badge>{selected ? <span className="text-xs font-medium text-primary">已选</span> : null}</div>
                <div className="mt-4 text-lg font-semibold">{signal.label}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.summary}</p>
                <div className="mt-4 flex gap-3 text-xs text-muted-foreground"><span>热度 {signal.heat}</span><span>拥挤度 {signal.crowding}</span><span>{signal.direction === "current" ? "当前高频" : signal.direction === "rising" ? "正在升温" : signal.direction === "falling" ? "正在降温" : "相对稳定"}</span></div>
                </button>
                <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">查看 {signal.evidenceItemIds.length} 条榜单证据</summary><div className="mt-2 space-y-1">{signal.evidenceItemIds.map((id) => { const item = evidenceById.get(id); return item ? <a key={id} href={item.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><span className="truncate">{PLATFORM_LABELS[item.platform]} · {item.listKey}第{item.rank}名 · {item.title}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : null; })}</div></details>
              </article>;
            })}
          </div>

          <Card className="sticky bottom-4 border-primary/30 bg-background/95 shadow-xl backdrop-blur">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-medium">已选 {selectedIds.length}/5 项市场信号</div><p className="mt-1 text-xs text-muted-foreground">AI 推荐已自动勾选，你可以替换后再开书。</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={influenceMode} onValueChange={(value) => setInfluenceMode(value as MarketInfluenceMode)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(MODE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                <Button onClick={() => briefMutation.mutate()} disabled={selectedIds.length === 0 || briefMutation.isPending}>{briefMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}用这些信号创作<ArrowRight className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
