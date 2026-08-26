import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MarketInfluenceMode,
  MarketFoundationSyncTarget,
  MarketRadarPlatform,
  MarketRadarSignal,
  MarketTrendReport,
} from "@ai-novel/shared/types/marketRadar";
import { ArrowRight, Check, ExternalLink, Loader2, Radar, RefreshCw, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  createMarketCreativeBrief,
  getMarketRadarScan,
  getMarketRadarSources,
  startMarketRadarAnalysis,
  startMarketRadarScan,
  syncMarketProductionFoundation,
} from "@/api/marketRadar";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { resolveMarketFoundationLibraryState } from "./marketFoundationLibraryState";

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

function marketSourceKey(value: { platform: string; listKey: string }): string {
  return `${value.platform}:${value.listKey}`;
}

export default function MarketRadarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [platforms, setPlatforms] = useState<MarketRadarPlatform[]>(["fanqie", "qidian", "jinjiang"]);
  const [activeRunId, setActiveRunId] = useState("");
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedAnalysisItemIds, setSelectedAnalysisItemIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [influenceMode, setInfluenceMode] = useState<MarketInfluenceMode>("differentiate");
  const initialScanStarted = useRef(false);
  const analysisResultRef = useRef<HTMLDivElement | null>(null);

  const sourcesQuery = useQuery({ queryKey: queryKeys.marketRadar.sources, queryFn: getMarketRadarSources });
  const scanQuery = useQuery({
    queryKey: queryKeys.marketRadar.scan(activeRunId || "none"),
    queryFn: () => getMarketRadarScan(activeRunId),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" || status === "analyzing" ? 1500 : false;
    },
  });
  const activeRun = scanQuery.data?.data ?? null;
  const report = showAnalysis ? activeRun?.report ?? null : null;

  useEffect(() => {
    if (!report) return;
    setSelectedIds((current) => current.length > 0 ? current : recommendedSignalIds(report));
  }, [report?.id]);

  useEffect(() => {
    if (report) analysisResultRef.current?.scrollIntoView({ block: "start" });
  }, [report?.id]);

  const scanMutation = useMutation({
    mutationFn: () => startMarketRadarScan(platforms),
    onSuccess: (response) => {
      const run = response.data;
      if (!run) return;
      setActiveRunId(run.id);
      setShowAnalysis(false);
      setSelectedAnalysisItemIds([]);
      setSelectedIds([]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "扫榜失败，请稍后重试。"),
  });
  const analysisMutation = useMutation({
    mutationFn: () => startMarketRadarAnalysis(activeRun!.id, {
      selectedItemIds: selectedAnalysisItemIds,
    }),
    onSuccess: (response) => {
      const run = response.data;
      if (!run) return;
      queryClient.setQueryData(queryKeys.marketRadar.scan(run.id), response);
      if (run.report) setSelectedIds(recommendedSignalIds(run.report));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "AI分析失败，请稍后重试。"),
  });
  const briefMutation = useMutation({
    mutationFn: () => createMarketCreativeBrief({ reportId: report!.id, signalIds: selectedIds, influenceMode }),
    onSuccess: (response) => {
      if (response.data) navigate(`/novels/auto-director?marketBriefId=${encodeURIComponent(response.data.id)}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "生成市场创作简报失败。"),
  });
  const foundationSyncMutation = useMutation({
    mutationFn: (target: MarketFoundationSyncTarget) => syncMarketProductionFoundation(report!.id, { target }),
    onSuccess: async (_response, target) => {
      await queryClient.invalidateQueries({
        queryKey: target === "genre" ? queryKeys.genres.all : queryKeys.storyModes.all,
      });
      await scanQuery.refetch();
      toast.success(target === "genre" ? "题材基底已加入资源库。" : "推进模式已加入资源库。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "加入资源库失败，请稍后重试。"),
  });

  useEffect(() => {
    if (initialScanStarted.current) return;
    initialScanStarted.current = true;
    scanMutation.mutate();
  }, []);

  const evidenceById = useMemo(() => new Map((report?.evidenceItems ?? []).map((item) => [item.id, item])), [report]);
  const scanning = (!activeRun && scanMutation.isPending) || activeRun?.status === "queued" || activeRun?.status === "running";
  const analyzing = analysisMutation.isPending || activeRun?.status === "analyzing";
  const foundationCandidate = report?.productionFoundationCandidate ?? null;
  const {
    genreId: genreLibraryId,
    primaryStoryModeId: primaryStoryModeLibraryId,
    secondaryStoryModeId: secondaryStoryModeLibraryId,
    storyModesNeedSync,
  } = resolveMarketFoundationLibraryState(foundationCandidate, report?.productionFoundationSync);
  const rankingGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof activeRun>["rankingItems"]>();
    for (const item of activeRun?.rankingItems ?? []) {
      const key = `${item.platform}:${item.listKey}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const isPrimaryList = (key: string) => key.endsWith(":new_book") || key.endsWith(":new_author");
    return [...groups.entries()]
      .sort(([left], [right]) => Number(isPrimaryList(right)) - Number(isPrimaryList(left)))
      .map(([key, items]) => ({
        key,
        platform: items[0].platform,
        listKey: items[0].listKey,
        items: items.sort((left, right) => left.rank - right.rank),
      }));
  }, [activeRun?.rankingItems]);
  const sourceLabels = useMemo(() => new Map((sourcesQuery.data?.data ?? []).map((source) => [`${source.platform}:${source.listKey}`, source.listLabel])), [sourcesQuery.data]);
  const rankingGroupSignature = rankingGroups.map((group) => group.key).join("|");

  useEffect(() => {
    if (scanning || rankingGroups.length === 0) return;
    const availableIds = new Set(rankingGroups.flatMap((group) => group.items.map((item) => item.id)));
    const reportItemIds = activeRun?.report?.analyzedItemIds?.filter((id) => availableIds.has(id)) ?? [];
    const reportListKeys = new Set(activeRun?.report?.analyzedLists?.map(marketSourceKey) ?? []);
    const primaryPlatforms = new Set(rankingGroups
      .filter((group) => group.listKey === "new_book" || group.listKey === "new_author")
      .map((group) => group.platform));
    const recommendedItemIds = rankingGroups
      .filter((group) => !primaryPlatforms.has(group.platform) || group.listKey === "new_book" || group.listKey === "new_author")
      .flatMap((group) => group.items.map((item) => item.id));
    const legacyReportItemIds = rankingGroups
      .filter((group) => reportListKeys.has(group.key))
      .flatMap((group) => group.items.map((item) => item.id));
    setSelectedAnalysisItemIds((current) => {
      const availableCurrent = current.filter((id) => availableIds.has(id));
      if (availableCurrent.length > 0) return availableCurrent;
      if (reportItemIds.length > 0) return reportItemIds;
      if (legacyReportItemIds.length > 0) return legacyReportItemIds;
      return recommendedItemIds;
    });
  }, [activeRun?.id, activeRun?.report?.id, rankingGroupSignature, scanning]);

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
  const toggleAnalysisList = (itemIds: string[]) => {
    setSelectedAnalysisItemIds((current) => {
      const currentSet = new Set(current);
      const allSelected = itemIds.every((id) => currentSet.has(id));
      if (allSelected) return current.filter((id) => !itemIds.includes(id));
      return [...new Set([...current, ...itemIds])];
    });
  };
  const toggleAnalysisItem = (id: string) => {
    setSelectedAnalysisItemIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };
  const openOrStartAnalysis = () => {
    setShowAnalysis(true);
    if (!activeRun?.report) analysisMutation.mutate();
  };

  return (
    <div className="w-full min-w-0 space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/35 pb-4">
        <h1 className="text-lg font-semibold tracking-tight">热门题材雷达</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <button key={key} type="button" onClick={() => togglePlatform(key as MarketRadarPlatform)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", platforms.includes(key as MarketRadarPlatform) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{label}</button>
          ))}
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || scanning || sourcesQuery.isPending} variant="outline">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? `正在获取榜单 ${Math.round((activeRun?.progress ?? 0) * 100)}%` : "重新扫榜"}
          </Button>
        </div>
      </div>

      {activeRun?.platformStatuses.some((item) => item.status !== "succeeded") ? (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/15"><CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">部分榜单暂时无法读取，仍可查看并分析已成功获取的数据：{activeRun.platformStatuses.filter((item) => item.status !== "succeeded").map((item) => `${PLATFORM_LABELS[item.platform]}：${item.error || "读取失败"}`).join("；")}</CardContent></Card>
      ) : null}
      {activeRun?.status === "failed" ? (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">本次扫榜未完成：{activeRun.lastError || "没有取得可分析的公开榜单数据。"}</CardContent></Card>
      ) : null}
      {activeRun?.lastError && activeRun.status !== "failed" ? (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/15"><CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">{activeRun.lastError}</CardContent></Card>
      ) : null}

      {rankingGroups.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">{scanning ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <Radar className="h-10 w-10 text-muted-foreground" />}<div className="font-medium">{scanning ? "正在获取公开榜单" : "还没有可展示的榜单数据"}</div><p className="max-w-lg text-sm text-muted-foreground">进入页面会自动扫榜。榜单获取完成后，你可以先查看原始排名，再决定是否让 AI 分析。</p></CardContent></Card>
      ) : <>
        <section className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <p className="text-sm text-muted-foreground">{activeRun?.report ? "本次报告使用当前勾选的作品；如需更换范围，请重新扫榜。" : `已选 ${selectedAnalysisItemIds.length} 本作品，可在各榜单右上角全选或逐本调整。`}</p>
          <div className="flex justify-end">
            <Button onClick={openOrStartAnalysis} disabled={scanning || analyzing || selectedAnalysisItemIds.length === 0} className="shrink-0">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {scanning ? "等待榜单获取完成" : analyzing ? `AI 分析中 ${Math.round((activeRun?.progress ?? 0) * 100)}%` : activeRun?.report ? "查看 AI 分析" : `开始 AI 分析（${selectedAnalysisItemIds.length} 本）`}
            </Button>
          </div>
        </section>
        <div className="grid items-start gap-x-6 gap-y-8 md:grid-cols-2 2xl:grid-cols-3">
          {rankingGroups.map(({ key, items }) => {
            const itemIds = items.map((item) => item.id);
            const selectedCount = itemIds.filter((id) => selectedAnalysisItemIds.includes(id)).length;
            const allSelected = selectedCount === itemIds.length;
            return <Card key={key} className="flex h-[34rem] flex-col">
            <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/40 px-4 pb-4 pt-4">
              <div><CardTitle className="text-base">{PLATFORM_LABELS[items[0].platform]} · {sourceLabels.get(key) ?? items[0].listKey}</CardTitle><CardDescription className="mt-1">本次识别 {items.length} 条公开上榜记录（最多 30 条）</CardDescription></div>
              <Button type="button" variant="ghost" size="sm" aria-pressed={allSelected} disabled={Boolean(activeRun?.report) || scanning || analyzing} onClick={() => toggleAnalysisList(itemIds)} className="shrink-0">
                {allSelected ? "取消全选" : "全选"}{selectedCount > 0 && !allSelected ? ` ${selectedCount}/${items.length}` : ""}
              </Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2"><div className="divide-y divide-border/35">{items.map((item) => {
              const selected = selectedAnalysisItemIds.includes(item.id);
              return <div key={item.id} className="grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_1.75rem] items-center gap-2 px-2 py-2.5 text-sm transition-colors hover:bg-muted/45">
                <button type="button" aria-pressed={selected} aria-label={`${selected ? "取消选择" : "选择"}${item.title}`} disabled={Boolean(activeRun?.report) || analyzing} onClick={() => toggleAnalysisItem(item.id)} className={cn("flex h-4 w-4 items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-70", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {selected ? <Check className="h-3 w-3" /> : null}
                </button>
                <span className="font-mono text-muted-foreground">#{item.rank}</span>
                <button type="button" disabled={Boolean(activeRun?.report) || analyzing} onClick={() => toggleAnalysisItem(item.id)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.author || "作者未公开"}{item.category ? ` · ${item.category}` : ""}</span>
                </button>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`查看${item.title}的公开来源`} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ExternalLink className="h-3.5 w-3.5" /></a>
              </div>;
            })}</div></CardContent>
          </Card>})}
        </div>
      </>}

      {report ? (
        <div ref={analysisResultRef} className="space-y-6 scroll-mt-6">
          <Card>
            <CardHeader><CardTitle className="text-xl">本期判断</CardTitle><CardDescription>采集于 {new Date(report.createdAt).toLocaleString()}，结论均可回看公开榜单证据。</CardDescription></CardHeader>
            <CardContent>
              <p className="leading-7">{report.summary}</p>
              {foundationCandidate ? (
                <div className="mt-4 rounded-lg bg-muted/45 px-4 py-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="text-muted-foreground">题材基底：</span>{report.productionFoundationSync?.genre?.path ?? foundationCandidate.genre.name}</span>
                      {genreLibraryId ? (
                        <Button type="button" variant="ghost" size="sm" asChild>
                          <Link to={`/genres?selectedId=${encodeURIComponent(genreLibraryId)}`}><Check className="h-3.5 w-3.5" />库中已有 · 查看</Link>
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled={foundationSyncMutation.isPending} onClick={() => foundationSyncMutation.mutate("genre")}>
                          {foundationSyncMutation.isPending && foundationSyncMutation.variables === "genre" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}加入题材基底库
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="text-muted-foreground">主要推进：</span>{report.productionFoundationSync?.storyModes?.primaryStoryMode.path ?? foundationCandidate.primaryStoryMode.name}</span>
                      {primaryStoryModeLibraryId ? <Button type="button" variant="ghost" size="sm" asChild><Link to={`/story-modes?selectedId=${encodeURIComponent(primaryStoryModeLibraryId)}`}><Check className="h-3.5 w-3.5" />库中已有 · 查看</Link></Button> : null}
                    </div>
                    {foundationCandidate.secondaryStoryMode ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span><span className="text-muted-foreground">辅助推进：</span>{report.productionFoundationSync?.storyModes?.secondaryStoryMode?.path ?? foundationCandidate.secondaryStoryMode.name}</span>
                        {secondaryStoryModeLibraryId ? <Button type="button" variant="ghost" size="sm" asChild><Link to={`/story-modes?selectedId=${encodeURIComponent(secondaryStoryModeLibraryId)}`}><Check className="h-3.5 w-3.5" />库中已有 · 查看</Link></Button> : null}
                      </div>
                    ) : null}
                    {storyModesNeedSync ? (
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" disabled={foundationSyncMutation.isPending} onClick={() => foundationSyncMutation.mutate("story_modes")}>
                          {foundationSyncMutation.isPending && foundationSyncMutation.variables === "story_modes" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}加入推进模式库
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">库中已有的方向直接复用；只有缺失的方向需要手动加入。下方市场信号用于选择本次开书偏好。</p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">{report.platformStatuses.map((status) => <Badge key={status.platform} variant={status.status === "failed" ? "destructive" : "outline"}>{PLATFORM_LABELS[status.platform]} · {status.itemCount}项{status.status === "stale" ? " · 建议刷新" : ""}</Badge>)}</div>
            </CardContent>
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
        </div>
      ) : null}
    </div>
  );
}
