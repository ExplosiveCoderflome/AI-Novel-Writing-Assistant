import type {
  CreateMarketCreativeBriefRequest,
  MarketCreativeBrief,
  MarketPlatformStatus,
  MarketRadarPlatform,
  MarketRankingItem,
  MarketScanRun,
  MarketTrendReport,
} from "@ai-novel/shared/types/marketRadar";
import { MARKET_RADAR_PLATFORMS } from "@ai-novel/shared/types/marketRadar";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  marketCreativeBriefPrompt,
  marketPlatformDigestPrompt,
  marketTrendSynthesisPrompt,
} from "../../../prompting/prompts/marketRadar/marketRadar.prompts";
import {
  collectMarketSource,
  MARKET_RADAR_SOURCES,
} from "../infrastructure/marketRadarSources";

const REFRESH_GUARD_MS = 30 * 60 * 1000;
const FRESH_REPORT_MS = 24 * 60 * 60 * 1000;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function platformLabel(platform: MarketRadarPlatform): string {
  return MARKET_RADAR_SOURCES.find((source) => source.platform === platform)?.platformLabel ?? platform;
}

function normalizePlatforms(platforms?: MarketRadarPlatform[]): MarketRadarPlatform[] {
  const requested = platforms?.filter((platform, index, list) => (
    MARKET_RADAR_PLATFORMS.includes(platform) && list.indexOf(platform) === index
  ));
  return requested?.length ? requested : [...MARKET_RADAR_PLATFORMS];
}

function samePlatforms(left: string, right: MarketRadarPlatform[]): boolean {
  const saved = parseJson<MarketRadarPlatform[]>(left, []).sort();
  return JSON.stringify(saved) === JSON.stringify([...right].sort());
}

function toRankingItem(row: {
  id: string;
  rank: number;
  title: string;
  author: string | null;
  category: string | null;
  tagsJson: string | null;
  synopsis: string | null;
  heatLabel: string | null;
  serialStatus: string | null;
  sourceUrl: string;
  snapshot: { platform: string; listKey: string };
}): MarketRankingItem {
  return {
    id: row.id,
    platform: row.snapshot.platform as MarketRadarPlatform,
    listKey: row.snapshot.listKey,
    rank: row.rank,
    title: row.title,
    author: row.author,
    category: row.category,
    tags: parseJson<string[]>(row.tagsJson, []),
    synopsis: row.synopsis,
    heatLabel: row.heatLabel,
    serialStatus: row.serialStatus,
    sourceUrl: row.sourceUrl,
  };
}

function buildPlatformStatuses(snapshots: Array<{
  platform: string;
  status: string;
  error: string | null;
  capturedAt: Date;
  items: unknown[];
}>): MarketPlatformStatus[] {
  const availablePlatforms = MARKET_RADAR_PLATFORMS.filter((platform) => snapshots.some((snapshot) => snapshot.platform === platform));
  return availablePlatforms.map((platform) => {
    const rows = snapshots.filter((snapshot) => snapshot.platform === platform);
    const succeeded = rows.filter((row) => row.status === "succeeded");
    const failed = rows.filter((row) => row.status === "failed");
    const capturedAt = succeeded.map((row) => row.capturedAt).sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      platform,
      status: succeeded.length > 0 ? failed.length > 0 ? "stale" : "succeeded" : "failed",
      itemCount: succeeded.reduce((sum, row) => sum + row.items.length, 0),
      capturedAt: capturedAt?.toISOString() ?? null,
      error: failed.map((row) => row.error).filter(Boolean).join("；") || null,
    };
  });
}

function formatRankingItems(items: MarketRankingItem[]): string {
  const groups = new Map<string, MarketRankingItem[]>();
  for (const item of items) {
    const key = `${item.title}::${item.author ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map((appearances) => {
    const item = appearances.sort((left, right) => left.rank - right.rank)[0];
    return [
    `证据ID=${appearances.map((appearance) => appearance.id).join(",")}`,
    `上榜记录=${appearances.map((appearance) => `${appearance.listKey}第${appearance.rank}名`).join("、")}`,
    `书名=${item.title}`,
    item.author ? `作者=${item.author}` : "",
    item.category ? `分类=${item.category}` : "",
    item.tags.length ? `公开标签=${item.tags.join("、")}` : "",
    item.heatLabel ? `公开热度=${item.heatLabel}` : "",
    item.serialStatus ? `状态=${item.serialStatus}` : "",
    item.synopsis ? `公开简介=${item.synopsis.slice(0, 320)}` : "",
    ].filter(Boolean).join(" | ");
  }).join("\n");
}

export class MarketRadarService {
  listSources() {
    return MARKET_RADAR_SOURCES;
  }

  async recoverInterruptedRuns(): Promise<void> {
    await prisma.marketScanRun.updateMany({
      where: { status: { in: ["queued", "running"] } },
      data: { status: "interrupted", lastError: "应用已重启，请重新扫榜。", finishedAt: new Date() },
    });
  }

  async startScan(platforms?: MarketRadarPlatform[]): Promise<MarketScanRun> {
    const requestedPlatforms = normalizePlatforms(platforms);
    const recent = await prisma.marketScanRun.findFirst({
      where: { createdAt: { gte: new Date(Date.now() - REFRESH_GUARD_MS) }, status: { in: ["queued", "running", "succeeded", "partial"] } },
      orderBy: { createdAt: "desc" },
      include: { snapshots: { include: { items: true } }, report: true },
    });
    if (recent && samePlatforms(recent.requestedPlatformsJson, requestedPlatforms)) {
      return this.getScan(recent.id) as Promise<MarketScanRun>;
    }

    const run = await prisma.marketScanRun.create({
      data: { requestedPlatformsJson: JSON.stringify(requestedPlatforms) },
    });
    setImmediate(() => void this.executeScan(run.id).catch(async (error) => {
      const message = error instanceof Error ? error.message : "市场分析失败";
      console.error("[market-radar] scan failed", error);
      await prisma.marketScanRun.updateMany({
        where: { id: run.id, status: { in: ["queued", "running"] } },
        data: { status: "failed", progress: 1, lastError: message, finishedAt: new Date() },
      });
    }));
    return this.getScan(run.id) as Promise<MarketScanRun>;
  }

  async getLatest(): Promise<MarketTrendReport | null> {
    const report = await prisma.marketTrendReport.findFirst({
      orderBy: { createdAt: "desc" },
      include: { run: { include: { snapshots: { include: { items: true } } } } },
    });
    return report ? this.serializeReport(report) : null;
  }

  async getScan(id: string): Promise<MarketScanRun | null> {
    const run = await prisma.marketScanRun.findUnique({
      where: { id },
      include: { snapshots: { include: { items: true } }, report: true },
    });
    if (!run) return null;
    const report = run.report ? await this.getReport(run.report.id) : null;
    return {
      id: run.id,
      status: run.status as MarketScanRun["status"],
      progress: run.progress,
      requestedPlatforms: parseJson<MarketRadarPlatform[]>(run.requestedPlatformsJson, []),
      platformStatuses: buildPlatformStatuses(run.snapshots),
      report,
      lastError: run.lastError,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  async getReport(id: string): Promise<MarketTrendReport | null> {
    const report = await prisma.marketTrendReport.findUnique({
      where: { id },
      include: { run: { include: { snapshots: { include: { items: true } } } } },
    });
    return report ? this.serializeReport(report) : null;
  }

  async createBrief(input: CreateMarketCreativeBriefRequest): Promise<MarketCreativeBrief> {
    const report = await this.getReport(input.reportId);
    if (!report) throw new Error("市场分析报告不存在。");
    const uniqueIds = [...new Set(input.signalIds)];
    if (uniqueIds.length < 1 || uniqueIds.length > 5) throw new Error("请选择1至5项市场信号。");
    const selectedSignals = uniqueIds.map((id) => report.signals.find((signal) => signal.id === id)).filter(Boolean) as MarketTrendReport["signals"];
    if (selectedSignals.length !== uniqueIds.length) throw new Error("选择中包含不属于当前报告的市场信号。");
    const result = await runStructuredPrompt({
      asset: marketCreativeBriefPrompt,
      promptInput: {
        influenceMode: input.influenceMode,
        selectedSignalsText: selectedSignals.map((signal) => `${signal.kind}｜${signal.label}｜${signal.summary}`).join("\n"),
      },
      options: { temperature: 0.25, maxTokens: 1_600, stage: "market_radar", itemKey: "creative_brief", entrypoint: "market_radar" },
    });
    const row = await prisma.marketCreativeBrief.create({
      data: {
        reportId: report.id,
        influenceMode: input.influenceMode,
        selectedSignalsJson: JSON.stringify(selectedSignals),
        summary: result.output.summary,
        promptBlock: result.output.promptBlock,
      },
    });
    return this.serializeBrief(row);
  }

  async getBrief(id: string): Promise<MarketCreativeBrief | null> {
    const row = await prisma.marketCreativeBrief.findUnique({ where: { id } });
    return row ? this.serializeBrief(row) : null;
  }

  async getBriefPromptBlock(id?: string | null): Promise<string> {
    if (!id?.trim()) return "";
    const brief = await prisma.marketCreativeBrief.findUnique({ where: { id: id.trim() }, select: { promptBlock: true } });
    return brief?.promptBlock.trim() ?? "";
  }

  async getFreshLatest(): Promise<MarketTrendReport | null> {
    const latest = await this.getLatest();
    if (!latest || Date.now() - new Date(latest.createdAt).getTime() > FRESH_REPORT_MS) return null;
    return latest;
  }

  private async executeScan(runId: string): Promise<void> {
    const run = await prisma.marketScanRun.update({
      where: { id: runId },
      data: { status: "running", startedAt: new Date(), progress: 0.05, lastError: null },
    });
    const requested = parseJson<MarketRadarPlatform[]>(run.requestedPlatformsJson, []);
    const sources = MARKET_RADAR_SOURCES.filter((source) => requested.includes(source.platform));
    await Promise.all(sources.map(async (source, index) => {
      try {
        const items = await collectMarketSource(source);
        await prisma.marketRankingSnapshot.create({
          data: {
            runId, platform: source.platform, listKey: source.listKey, listLabel: source.listLabel,
            channel: source.channel, sourceUrl: source.sourceUrl,
            items: { create: items.map((item) => ({
              rank: item.rank,
              title: item.title,
              author: item.author,
              category: item.category,
              tagsJson: JSON.stringify(item.tags),
              synopsis: item.synopsis,
              heatLabel: item.heatLabel,
              serialStatus: item.serialStatus,
              sourceUrl: item.sourceUrl,
            })) },
          },
        });
      } catch (error) {
        await prisma.marketRankingSnapshot.create({
          data: {
            runId, platform: source.platform, listKey: source.listKey, listLabel: source.listLabel,
            channel: source.channel, sourceUrl: source.sourceUrl, status: "failed",
            error: error instanceof Error ? error.message : "榜单采集失败",
          },
        });
      } finally {
        await prisma.marketScanRun.update({ where: { id: runId }, data: { progress: 0.1 + ((index + 1) / sources.length) * 0.45 } });
      }
    }));

    const snapshots = await prisma.marketRankingSnapshot.findMany({ where: { runId }, include: { items: true } });
    const successful = snapshots.filter((snapshot) => snapshot.status === "succeeded" && snapshot.items.length > 0);
    if (successful.length === 0) {
      await prisma.marketScanRun.update({ where: { id: runId }, data: { status: "failed", progress: 1, finishedAt: new Date(), lastError: "三个平台均未获取到可分析的公开榜单元数据。" } });
      return;
    }

    const allRows = successful.flatMap((snapshot) => snapshot.items.map((item) => ({ ...item, snapshot })));
    const allItems = allRows.map(toRankingItem);
    const platformDigests = await Promise.all(requested.map(async (platform) => {
      const items = allItems.filter((item) => item.platform === platform);
      if (items.length === 0) return null;
      const result = await runStructuredPrompt({
        asset: marketPlatformDigestPrompt,
        promptInput: { platformLabel: platformLabel(platform), rankingText: formatRankingItems(items), evidenceItemIds: items.map((item) => item.id) },
        options: { temperature: 0.2, maxTokens: 3_000, taskId: runId, stage: "market_radar", itemKey: `digest_${platform}`, entrypoint: "market_radar" },
      });
      return { platform, ...result.output };
    }));
    await prisma.marketScanRun.update({ where: { id: runId }, data: { progress: 0.75 } });

    const history = await this.buildHistorySummary(successful);
    const synthesis = await runStructuredPrompt({
      asset: marketTrendSynthesisPrompt,
      promptInput: {
        platformDigestsText: platformDigests.filter(Boolean).map((digest) => `${platformLabel(digest!.platform)}\n${digest!.platformSummary}\n${JSON.stringify(digest!.signals)}`).join("\n\n"),
        historyText: history.text,
        evidenceItemIds: allItems.map((item) => item.id),
        hasComparableHistory: history.hasComparableHistory,
      },
      options: { temperature: 0.2, maxTokens: 4_000, taskId: runId, stage: "market_radar", itemKey: "cross_platform_synthesis", entrypoint: "market_radar" },
    });
    await prisma.marketTrendReport.create({
      data: { runId, summary: synthesis.output.summary, structuredDataJson: JSON.stringify(synthesis.output) },
    });
    const hasFailures = snapshots.some((snapshot) => snapshot.status === "failed");
    await prisma.marketScanRun.update({ where: { id: runId }, data: { status: hasFailures ? "partial" : "succeeded", progress: 1, finishedAt: new Date() } });
  }

  private async buildHistorySummary(currentSnapshots: Array<{ platform: string; listKey: string; capturedAt: Date; items: Array<{ title: string; author: string | null; rank: number }> }>): Promise<{ text: string; hasComparableHistory: boolean }> {
    const lines: string[] = [];
    for (const current of currentSnapshots) {
      const previous = await prisma.marketRankingSnapshot.findFirst({
        where: { platform: current.platform, listKey: current.listKey, status: "succeeded", capturedAt: { lt: current.capturedAt } },
        orderBy: { capturedAt: "desc" }, include: { items: true },
      });
      if (!previous) continue;
      const previousRanks = new Map(previous.items.map((item) => [`${item.title}::${item.author ?? ""}`, item.rank]));
      const changes = current.items.flatMap((item) => {
        const oldRank = previousRanks.get(`${item.title}::${item.author ?? ""}`);
        return oldRank ? [`${item.title}: ${oldRank}→${item.rank}`] : [];
      }).slice(0, 20);
      lines.push(`${current.platform}/${current.listKey}: ${changes.join("，") || "没有重复上榜作品"}`);
    }
    return { text: lines.join("\n"), hasComparableHistory: lines.length > 0 };
  }

  private serializeReport(report: {
    id: string; runId: string; summary: string; structuredDataJson: string; createdAt: Date;
    run: { snapshots: Array<{ platform: string; listKey: string; status: string; error: string | null; capturedAt: Date; items: any[] }> };
  }): MarketTrendReport {
    const structured = parseJson<{ signals: MarketTrendReport["signals"] }>(report.structuredDataJson, { signals: [] });
    const evidenceItems = report.run.snapshots.flatMap((snapshot) => snapshot.items.map((item) => toRankingItem({ ...item, snapshot })));
    return {
      id: report.id, scanRunId: report.runId, summary: report.summary, signals: structured.signals,
      platformStatuses: buildPlatformStatuses(report.run.snapshots), evidenceItems, createdAt: report.createdAt.toISOString(),
    };
  }

  private serializeBrief(row: { id: string; reportId: string; influenceMode: string; selectedSignalsJson: string; summary: string; promptBlock: string; createdAt: Date }): MarketCreativeBrief {
    return {
      id: row.id, reportId: row.reportId, influenceMode: row.influenceMode as MarketCreativeBrief["influenceMode"],
      selectedSignals: parseJson(row.selectedSignalsJson, []), summary: row.summary, promptBlock: row.promptBlock,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const marketRadarService = new MarketRadarService();
