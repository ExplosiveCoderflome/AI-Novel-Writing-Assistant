import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, OpenConflict, PayoffLedgerResponse } from "@ai-novel/shared/types/novel";
import type { PayoffLedgerItem } from "@ai-novel/shared/types/payoffLedger";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { payoffLedgerSyncPrompt } from "../../prompting/prompts/payoff/payoffLedgerSync.prompts";
import {
  appendStaleRiskSignal,
  buildPayoffLedgerResponse,
  buildSyntheticPayoffIssues,
  clearStaleRiskSignal,
  dedupeRiskSignals,
  mapPayoffLedgerRow,
  serializeLedgerJson,
} from "./payoffLedgerShared";
import {
  createNovelChapterReferenceLookup,
  normalizePayoffLedgerPromptChapterRefs,
} from "./payoffLedgerChapterRefs";

interface PayoffLedgerSyncOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  chapterOrder?: number | null;
  sourceChapterId?: string | null;
}

interface PayoffLedgerReadOptions extends PayoffLedgerSyncOptions {
  syncIfMissing?: boolean;
}

function compactText(value: string | null | undefined, fallback = "无"): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeConflict(row: {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceSnapshotId: string | null;
  sourceIssueId: string | null;
  sourceType: string;
  conflictType: string;
  conflictKey: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  evidenceJson: string | null;
  affectedCharacterIdsJson: string | null;
  resolutionHint: string | null;
  lastSeenChapterOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}): OpenConflict {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    sourceSnapshotId: row.sourceSnapshotId,
    sourceIssueId: row.sourceIssueId,
    sourceType: row.sourceType,
    conflictType: row.conflictType,
    conflictKey: row.conflictKey,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    status: row.status,
    evidenceJson: row.evidenceJson,
    affectedCharacterIdsJson: row.affectedCharacterIdsJson,
    resolutionHint: row.resolutionHint,
    lastSeenChapterOrder: row.lastSeenChapterOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatMajorPayoffs(rawPlanJson: string | null | undefined): string {
  const parsed = safeParseJson<{ major_payoffs?: unknown }>(rawPlanJson, {});
  const majorPayoffs = Array.isArray(parsed.major_payoffs)
    ? parsed.major_payoffs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return majorPayoffs.length > 0
    ? majorPayoffs.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "无";
}

export class PayoffLedgerSyncService {
  private async getResolvedChapterOrder(novelId: string, options: PayoffLedgerSyncOptions): Promise<number | null> {
    if (typeof options.chapterOrder === "number") {
      return options.chapterOrder;
    }
    const [sourceChapter, latestChapter] = await Promise.all([
      options.sourceChapterId
        ? prisma.chapter.findFirst({
            where: { id: options.sourceChapterId, novelId },
            select: { order: true },
          })
        : Promise.resolve(null),
      prisma.chapter.findFirst({
        where: { novelId },
        orderBy: { order: "desc" },
        select: { order: true },
      }),
    ]);
    return sourceChapter?.order ?? latestChapter?.order ?? null;
  }

  private async loadLedgerRows(novelId: string) {
    return prisma.payoffLedgerItem.findMany({
      where: { novelId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  private async buildSyncPromptInput(novelId: string, options: PayoffLedgerSyncOptions) {
    const chapterOrder = await this.getResolvedChapterOrder(novelId, options);
    const [novel, volumeRows, snapshot, openConflicts, recentAuditReports] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          storyMacroPlan: {
            select: {
              decompositionJson: true,
            },
          },
        },
      }),
      prisma.volumePlan.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        include: {
          chapters: {
            orderBy: { chapterOrder: "asc" },
            select: {
              id: true,
              chapterOrder: true,
              title: true,
              summary: true,
              payoffRefsJson: true,
            },
          },
        },
      }),
      prisma.storyStateSnapshot.findFirst({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        include: {
          sourceChapter: {
            select: {
              id: true,
              order: true,
              title: true,
            },
          },
          foreshadowStates: true,
        },
      }),
      prisma.openConflict.findMany({
        where: {
          novelId,
          status: "open",
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 12,
      }),
      prisma.auditReport.findMany({
        where: { novelId, auditType: "plot" },
        orderBy: [{ createdAt: "desc" }],
        take: 6,
        include: {
          issues: {
            where: { status: "open" },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    ]);

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const activeVolume = typeof chapterOrder === "number"
      ? volumeRows.find((volume) => volume.chapters.some((chapter) => chapter.chapterOrder === chapterOrder))
      : volumeRows.at(-1) ?? null;

    const activeVolumeSummary = activeVolume
      ? [
          `当前卷：第${activeVolume.sortOrder}卷《${activeVolume.title}》`,
          `卷摘要：${compactText(activeVolume.summary)}`,
          `卷 open payoffs：${safeParseJson<string[]>(activeVolume.openPayoffsJson, []).join("；") || "无"}`,
          activeVolume.chapters.length > 0
            ? `卷章节范围：${activeVolume.chapters[0]?.chapterOrder ?? "-"}-${activeVolume.chapters[activeVolume.chapters.length - 1]?.chapterOrder ?? "-"}`
            : "卷章节范围：无",
        ].join("\n")
      : `当前暂无激活卷窗口。${volumeRows.length > 0 ? `已有卷：${volumeRows.map((item) => `第${item.sortOrder}卷《${item.title}》`).join("；")}` : ""}`;

    const latestChapterContext = [
      typeof chapterOrder === "number" ? `当前章节序号：第${chapterOrder}章` : "当前章节序号：未知",
      snapshot?.sourceChapter
        ? `最新状态快照来源：第${snapshot.sourceChapter.order}章《${snapshot.sourceChapter.title}》`
        : "最新状态快照来源：无",
      snapshot?.summary ? `状态快照摘要：${snapshot.summary}` : "",
    ].filter(Boolean).join("\n");

    const openPayoffsText = volumeRows.length > 0
      ? volumeRows.map((volume) => {
          const openPayoffs = safeParseJson<string[]>(volume.openPayoffsJson, []);
          if (openPayoffs.length === 0) {
            return "";
          }
          return `【第${volume.sortOrder}卷 ${volume.title}】\n- ${openPayoffs.join("\n- ")}`;
        }).filter(Boolean).join("\n\n") || "无"
      : "无";

    const chapterPayoffRefsText = volumeRows.flatMap((volume) => volume.chapters.map((chapter) => {
      const refs = safeParseJson<string[]>(chapter.payoffRefsJson, []);
      if (refs.length === 0) {
        return "";
      }
      return `第${chapter.chapterOrder}章《${chapter.title}》\n- ${refs.join("\n- ")}`;
    })).filter(Boolean).join("\n\n") || "无";

    const foreshadowStatesText = snapshot?.foreshadowStates.length
      ? snapshot.foreshadowStates.map((item) => (
        [
          `标题：${item.title}`,
          `状态：${compactText(item.status)}`,
          item.summary ? `摘要：${item.summary}` : "",
          item.setupChapterId ? `setupChapterId：${item.setupChapterId}` : "",
          item.payoffChapterId ? `payoffChapterId：${item.payoffChapterId}` : "",
        ].filter(Boolean).join(" | ")
      )).join("\n")
      : "无";

    const payoffConflictsText = openConflicts.length > 0
      ? openConflicts.map((row) => {
          const conflict = normalizeConflict(row);
          return [
            `${conflict.conflictType}/${conflict.severity}：${conflict.title}`,
            conflict.summary,
            conflict.resolutionHint ? `修复建议：${conflict.resolutionHint}` : "",
          ].filter(Boolean).join(" | ");
        }).join("\n")
      : "无";

    const payoffAuditIssuesText = recentAuditReports.length > 0
      ? recentAuditReports.flatMap((report) => report.issues.map((issue) => (
        `${issue.code} (${issue.severity})：${issue.description} | 证据：${issue.evidence}`
      ))).join("\n") || "无"
      : "无";

    return {
      chapterOrder,
      latestSnapshotId: snapshot?.id ?? null,
      promptInput: {
        novelTitle: novel.title,
        activeVolumeSummary,
        latestChapterContext,
        majorPayoffsText: formatMajorPayoffs(novel.storyMacroPlan?.decompositionJson),
        openPayoffsText,
        chapterPayoffRefsText,
        foreshadowStatesText,
        payoffConflictsText,
        payoffAuditIssuesText,
      },
    };
  }

  private async syncLedgerOpenConflicts(novelId: string, items: PayoffLedgerItem[]): Promise<void> {
    const syntheticIssues = buildSyntheticPayoffIssues(items);
    const activeConflictKeys = syntheticIssues.map((issue) => `payoff:${issue.ledgerKey}:${issue.code}`);

    await prisma.$transaction(async (tx) => {
      await tx.openConflict.updateMany({
        where: {
          novelId,
          sourceType: "payoff_ledger",
          status: "open",
          conflictKey: {
            notIn: activeConflictKeys,
          },
        },
        data: {
          status: "resolved",
        },
      });

      for (const issue of syntheticIssues) {
        const ledgerItem = items.find((item) => item.ledgerKey === issue.ledgerKey);
        const conflictKey = `payoff:${issue.ledgerKey}:${issue.code}`;
        const data = {
          chapterId: ledgerItem?.lastTouchedChapterId ?? ledgerItem?.setupChapterId ?? ledgerItem?.payoffChapterId ?? null,
          sourceSnapshotId: ledgerItem?.lastSnapshotId ?? null,
          sourceIssueId: null,
          conflictType: issue.code,
          title: `payoff/${issue.code}`,
          summary: issue.description,
          severity: issue.severity,
          status: "open",
          evidenceJson: JSON.stringify([issue.evidence]),
          affectedCharacterIdsJson: JSON.stringify([]),
          resolutionHint: issue.fixSuggestion,
          lastSeenChapterOrder: ledgerItem?.lastTouchedChapterOrder ?? ledgerItem?.targetEndChapterOrder ?? null,
        };
        const updated = await tx.openConflict.updateMany({
          where: {
            novelId,
            sourceType: "payoff_ledger",
            conflictKey,
          },
          data,
        });
        if (updated.count === 0) {
          await tx.openConflict.create({
            data: {
              novelId,
              sourceType: "payoff_ledger",
              conflictKey,
              ...data,
            },
          });
        }
      }
    });
  }

  async getPayoffLedger(novelId: string, options: PayoffLedgerReadOptions = {}): Promise<PayoffLedgerResponse> {
    let rows = await this.loadLedgerRows(novelId);
    if (rows.length === 0 && options.syncIfMissing !== false) {
      try {
        const synced = await this.syncLedger(novelId, options);
        return synced;
      } catch {
        rows = await this.loadLedgerRows(novelId);
      }
    }
    return buildPayoffLedgerResponse(rows.map(mapPayoffLedgerRow), options.chapterOrder);
  }

  async syncLedger(novelId: string, options: PayoffLedgerSyncOptions = {}): Promise<PayoffLedgerResponse> {
    const existingRows = await this.loadLedgerRows(novelId);
    try {
      const { promptInput, chapterOrder, latestSnapshotId } = await this.buildSyncPromptInput(novelId, options);
      const result = await runStructuredPrompt({
        asset: payoffLedgerSyncPrompt,
        promptInput,
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.2,
        },
      });
      const now = new Date();
      const outputByKey = new Map(result.output.items.map((item) => [item.ledgerKey, item]));
      const chapterLookup = createNovelChapterReferenceLookup(await prisma.chapter.findMany({
        where: { novelId },
        select: {
          id: true,
          order: true,
        },
      }));

      await prisma.$transaction(async (tx) => {
        for (const item of result.output.items) {
          const previous = existingRows.find((row) => row.ledgerKey === item.ledgerKey);
          const normalizedChapterRefs = normalizePayoffLedgerPromptChapterRefs({
            item,
            previous,
            lookup: chapterLookup,
            currentChapterOrder: chapterOrder,
            sourceChapterId: options.sourceChapterId,
          });
          const riskSignals = clearStaleRiskSignal(dedupeRiskSignals(item.riskSignals.map((signal) => ({
            code: signal.code,
            severity: signal.severity,
            summary: signal.summary,
          }))));
          await tx.payoffLedgerItem.upsert({
            where: {
              novelId_ledgerKey: {
                novelId,
                ledgerKey: item.ledgerKey,
              },
            },
            create: {
              novelId,
              ledgerKey: item.ledgerKey,
              title: item.title,
              summary: item.summary,
              scopeType: item.scopeType,
              currentStatus: item.currentStatus,
              targetStartChapterOrder: item.targetStartChapterOrder ?? null,
              targetEndChapterOrder: item.targetEndChapterOrder ?? null,
              firstSeenChapterOrder: item.firstSeenChapterOrder ?? null,
              lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? null,
              lastTouchedChapterId: normalizedChapterRefs.lastTouchedChapterId,
              setupChapterId: normalizedChapterRefs.setupChapterId,
              payoffChapterId: normalizedChapterRefs.payoffChapterId,
              lastSnapshotId: latestSnapshotId ?? previous?.lastSnapshotId ?? null,
              sourceRefsJson: serializeLedgerJson(normalizedChapterRefs.sourceRefs),
              evidenceJson: serializeLedgerJson(normalizedChapterRefs.evidence),
              riskSignalsJson: serializeLedgerJson(riskSignals),
              statusReason: item.statusReason?.trim() || null,
              confidence: item.confidence ?? null,
              updatedAt: now,
            },
            update: {
              title: item.title,
              summary: item.summary,
              scopeType: item.scopeType,
              currentStatus: item.currentStatus,
              targetStartChapterOrder: item.targetStartChapterOrder ?? null,
              targetEndChapterOrder: item.targetEndChapterOrder ?? null,
              firstSeenChapterOrder: item.firstSeenChapterOrder ?? previous?.firstSeenChapterOrder ?? null,
              lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? previous?.lastTouchedChapterOrder ?? null,
              lastTouchedChapterId: normalizedChapterRefs.lastTouchedChapterId,
              setupChapterId: normalizedChapterRefs.setupChapterId,
              payoffChapterId: normalizedChapterRefs.payoffChapterId,
              lastSnapshotId: latestSnapshotId ?? previous?.lastSnapshotId ?? null,
              sourceRefsJson: serializeLedgerJson(normalizedChapterRefs.sourceRefs),
              evidenceJson: serializeLedgerJson(normalizedChapterRefs.evidence),
              riskSignalsJson: serializeLedgerJson(riskSignals),
              statusReason: item.statusReason?.trim() || null,
              confidence: item.confidence ?? null,
              updatedAt: now,
            },
          });
        }

        for (const row of existingRows) {
          if (outputByKey.has(row.ledgerKey) || row.currentStatus === "paid_off") {
            continue;
          }
          const staleSignals = appendStaleRiskSignal(
            safeParseJson(row.riskSignalsJson, [] as Array<{ code: string; severity: "low" | "medium" | "high" | "critical"; summary: string; stale?: boolean }>),
            "本轮 AI 对账没有再次命中这条伏笔，已保留旧账本并标记为 stale，等待下一次同步确认。",
          );
          await tx.payoffLedgerItem.update({
            where: { id: row.id },
            data: {
              riskSignalsJson: serializeLedgerJson(staleSignals),
              updatedAt: now,
            },
          });
        }
      });

      const rows = await this.loadLedgerRows(novelId);
      const items = rows.map(mapPayoffLedgerRow);
      await this.syncLedgerOpenConflicts(novelId, items);
      return buildPayoffLedgerResponse(items, chapterOrder);
    } catch (error) {
      if (existingRows.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const row of existingRows) {
            const staleSignals = appendStaleRiskSignal(
              safeParseJson(row.riskSignalsJson, [] as Array<{ code: string; severity: "low" | "medium" | "high" | "critical"; summary: string; stale?: boolean }>),
              "伏笔账本同步失败，已保留上次成功结果。",
            );
            await tx.payoffLedgerItem.update({
              where: { id: row.id },
              data: {
                riskSignalsJson: serializeLedgerJson(staleSignals),
              },
            });
          }
        }).catch(() => null);
        return buildPayoffLedgerResponse(existingRows.map(mapPayoffLedgerRow), options.chapterOrder);
      }
      throw error;
    }
  }

  buildSyntheticAuditReports(novelId: string, chapterId: string, chapterOrder: number, ledger: PayoffLedgerResponse): AuditReport[] {
    const issues = buildSyntheticPayoffIssues(ledger.items, chapterOrder);
    if (issues.length === 0) {
      return [];
    }
    const reportId = `payoff-ledger:${novelId}:${chapterId}`;
    const now = new Date().toISOString();
    return [{
      id: reportId,
      novelId,
      chapterId,
      auditType: "plot",
      overallScore: null,
      summary: "系统根据伏笔账本补充了需要继续跟踪的兑现风险。",
      legacyScoreJson: null,
      issues: issues.map((issue) => ({
        id: `${reportId}:${issue.ledgerKey}:${issue.code}`,
        reportId,
        auditType: "plot",
        severity: issue.severity,
        code: issue.code,
        description: issue.description,
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    }];
  }
}

export const payoffLedgerSyncService = new PayoffLedgerSyncService();
