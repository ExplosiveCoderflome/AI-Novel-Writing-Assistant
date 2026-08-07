/**
 * stockMemoryManager.ts
 *
 * ACM 四层记忆治理引擎 — P&L KPI 中轴线
 *
 * 职责：
 * 1. P&L 计算（实时/预期/复盘）
 * 2. 持仓变化检测（detectDrift）
 * 3. 持仓快照保存（saveSnapshot）
 * 4. 分层 context 组装（4层 token 预算 ~4000 tokens）
 * 5. 记忆提纯（compressStrategyToSummary）
 * 6. 纪律蒸馏（distillDisciplineFromRetro）
 * 7. 记忆遗忘（runForgettingPass）
 */

import { prisma } from "../../../db/prisma";
import {
  StockPositionItem,
  PositionPnLItem,
  TotalPnLSummary,
  ProjectedPnLSummary,
  PositionChange,
  DriftResult,
  RetroPnLResult,
  StrategyActionItem,
} from "../types/stockTypes";
import { stockKnowledgeGraphStoreService } from "./stockKnowledgeGraphStore";

// ==================================================================
// 1. 实时 P&L 计算
// ==================================================================

/**
 * 计算每笔持仓的实时 P&L
 */
export function computePositionPnL(
  positions: StockPositionItem[],
  quotesMap: Map<string, number>
): PositionPnLItem[] {
  const totalMarketValue = positions.reduce((acc, p) => {
    const price = quotesMap.get(p.symbol.toUpperCase()) ?? p.marketPrice ?? p.costBasis;
    return acc + price * p.shares;
  }, 0);

  return positions.map((p) => {
    const symbol = p.symbol.toUpperCase();
    const currentPrice = quotesMap.get(symbol) ?? p.marketPrice ?? p.costBasis;
    const marketValue = currentPrice * p.shares;
    const costValue = p.costBasis * p.shares;
    const pnl = marketValue - costValue;
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
    const concentrationPct = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;

    return {
      symbol,
      companyName: p.companyName,
      shares: p.shares,
      costBasis: p.costBasis,
      currentPrice,
      marketValue,
      pnl: Number(pnl.toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(2)),
      costValue: Number(costValue.toFixed(2)),
      concentrationPct: Number(concentrationPct.toFixed(1)),
    };
  });
}

/**
 * 计算组合总 P&L 汇总
 */
export function computeTotalPnL(
  positions: StockPositionItem[],
  cashBalance: number,
  quotesMap: Map<string, number>
): TotalPnLSummary {
  const positionPnL = computePositionPnL(positions, quotesMap);
  const totalMarketValue = positionPnL.reduce((acc, p) => acc + p.marketValue, 0);
  const totalCostBasis = positionPnL.reduce((acc, p) => acc + p.costValue, 0);
  const totalPnL = totalMarketValue - totalCostBasis;
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

  return {
    totalMarketValue: Number(totalMarketValue.toFixed(2)),
    totalCostBasis: Number(totalCostBasis.toFixed(2)),
    totalPnL: Number(totalPnL.toFixed(2)),
    totalPnLPct: Number(totalPnLPct.toFixed(2)),
    cashBalance: Number(cashBalance.toFixed(2)),
    netAssets: Number((totalMarketValue + cashBalance).toFixed(2)),
    positions: positionPnL,
  };
}

/**
 * 格式化 P&L 为人类可读字符串
 */
export function formatTotalPnLContext(summary: TotalPnLSummary): string {
  const pnlSign = summary.totalPnL >= 0 ? "+" : "";
  const lines = [
    `【实时组合 P&L】`,
    `总持仓市值: $${summary.totalMarketValue.toFixed(2)} | 总成本: $${summary.totalCostBasis.toFixed(2)} | 闲置现金: $${summary.cashBalance.toFixed(2)}`,
    `总浮盈: ${pnlSign}$${summary.totalPnL.toFixed(2)} (${pnlSign}${summary.totalPnLPct.toFixed(2)}%) | 净资产: $${summary.netAssets.toFixed(2)}`,
    `各股盈亏:`,
    ...summary.positions.map((p) => {
      const sign = p.pnl >= 0 ? "+" : "";
      const warning = p.concentrationPct > 30 ? " ⚠️集中度超30%" : "";
      return `  ${p.symbol}: ${p.shares}股 成本$${p.costBasis} 现价$${p.currentPrice.toFixed(2)} → ${sign}$${p.pnl.toFixed(2)} (${sign}${p.pnlPct.toFixed(1)}%) 占比${p.concentrationPct.toFixed(1)}%${warning}`;
    }),
  ];
  return lines.join("\n");
}

// ==================================================================
// 2. 指南预期 P&L 计算
// ==================================================================

/**
 * 基于 AI actions 计算指南预期 P&L
 */
export function computeProjectedPnL(
  actions: StrategyActionItem[],
  quotesMap: Map<string, number>
): ProjectedPnLSummary {
  const byAction = actions
    .filter((a) => a.action !== "HOLD")
    .map((a) => {
      const currentPrice = quotesMap.get(a.symbol.toUpperCase()) ?? a.estimatedPrice;
      let projectedPnL = a.projectedPnL ?? 0;
      let projectedPnLPct = a.projectedPnLPct ?? 0;

      // 如果 AI 没有给出 projectedPnL，用 targetPrice 计算
      if (!a.projectedPnL && a.targetPrice && currentPrice > 0) {
        if (a.action === "BUY") {
          projectedPnL = (a.targetPrice - currentPrice) * a.suggestedShares;
          projectedPnLPct = ((a.targetPrice - currentPrice) / currentPrice) * 100;
        } else if (a.action === "SELL" || a.action === "TRIM") {
          // 卖出锁定的盈利 = (当前价 - 成本估算) * 股数
          projectedPnL = a.estimatedAmount > 0 ? a.estimatedAmount : currentPrice * a.suggestedShares;
          projectedPnLPct = 0;
        }
      }

      return {
        symbol: a.symbol,
        action: a.action,
        projectedPnL: Number(projectedPnL.toFixed(2)),
        projectedPnLPct: Number(projectedPnLPct.toFixed(2)),
        targetPrice: a.targetPrice,
        stopLossPrice: a.stopLossPrice,
        timeHorizon: a.timeHorizon,
      };
    });

  const totalProjectedChange = byAction.reduce((acc, a) => acc + a.projectedPnL, 0);

  return {
    totalProjectedChange: Number(totalProjectedChange.toFixed(2)),
    byAction,
  };
}

// ==================================================================
// 3. 持仓变化检测（detectDrift）
// ==================================================================

/**
 * 对比 DB 持仓 vs OpenD 持仓，检测已发生的操盘变化
 */
export function detectDrift(
  dbPositions: StockPositionItem[],
  openDPositions: StockPositionItem[],
  dbCash: number,
  openDCash: number
): DriftResult {
  const changes: PositionChange[] = [];

  const dbMap = new Map(dbPositions.map((p) => [p.symbol.toUpperCase(), p]));
  const openDMap = new Map(openDPositions.map((p) => [p.symbol.toUpperCase(), p]));

  // 检测新增/增加/减少的持仓
  for (const [symbol, openDPos] of openDMap) {
    const dbPos = dbMap.get(symbol);
    if (!dbPos) {
      changes.push({
        symbol,
        type: "ADDED",
        oldShares: 0,
        newShares: openDPos.shares,
        sharesDelta: openDPos.shares,
        currentPrice: openDPos.marketPrice,
        estimatedTradeValue: openDPos.shares * (openDPos.marketPrice ?? openDPos.costBasis),
      });
    } else if (Math.abs(openDPos.shares - dbPos.shares) >= 0.5) {
      // 股数变化（支持小数股，但阈值 0.5 避免浮点噪声）
      const delta = openDPos.shares - dbPos.shares;
      changes.push({
        symbol,
        type: delta > 0 ? "INCREASED" : "DECREASED",
        oldShares: dbPos.shares,
        newShares: openDPos.shares,
        sharesDelta: Math.abs(delta),
        currentPrice: openDPos.marketPrice,
        estimatedTradeValue: Math.abs(delta) * (openDPos.marketPrice ?? openDPos.costBasis),
      });
    }
  }

  // 检测清仓（DB 有，OpenD 没有）
  for (const [symbol, dbPos] of dbMap) {
    if (!openDMap.has(symbol)) {
      changes.push({
        symbol,
        type: "REMOVED",
        oldShares: dbPos.shares,
        newShares: 0,
        sharesDelta: dbPos.shares,
        currentPrice: dbPos.marketPrice,
        estimatedTradeValue: dbPos.shares * (dbPos.marketPrice ?? dbPos.costBasis),
      });
    }
  }

  const cashDelta = openDCash - dbCash;
  const hasChanges = changes.length > 0 || Math.abs(cashDelta) > 1;

  // 生成人类可读摘要
  const summaryParts = changes.map((c) => {
    switch (c.type) {
      case "ADDED":
        return `新建仓 ${c.symbol} +${c.newShares}股 (~$${c.estimatedTradeValue?.toFixed(0)})`;
      case "REMOVED":
        return `清仓 ${c.symbol} -${c.oldShares}股`;
      case "INCREASED":
        return `加仓 ${c.symbol} +${c.sharesDelta}股 (${c.oldShares}→${c.newShares})`;
      case "DECREASED":
        return `减仓 ${c.symbol} -${c.sharesDelta}股 (${c.oldShares}→${c.newShares})`;
    }
  });

  if (Math.abs(cashDelta) > 1) {
    summaryParts.push(`现金变化 ${cashDelta >= 0 ? "+" : ""}$${cashDelta.toFixed(2)}`);
  }

  return {
    hasChanges,
    changes,
    cashDelta: Number(cashDelta.toFixed(2)),
    summary: summaryParts.length > 0 ? summaryParts.join("；") : "持仓无变化",
  };
}

// ==================================================================
// 4. 持仓快照保存
// ==================================================================

/**
 * 保存当前持仓快照至 DB（用于后续 drift 检测和复盘 P&L 归因）
 */
export async function savePortfolioSnapshot(
  portfolioId: string,
  positions: StockPositionItem[],
  cashBalance: number,
  quotesMap: Map<string, number>,
  strategyId?: string
): Promise<void> {
  const pnlSummary = computeTotalPnL(positions, cashBalance, quotesMap);
  const snapshotDate = new Date().toISOString().replace("T", " ").substring(0, 16);

  const snapshotPositions = positions.map((p) => ({
    symbol: p.symbol.toUpperCase(),
    shares: p.shares,
    costBasis: p.costBasis,
    marketPrice: quotesMap.get(p.symbol.toUpperCase()) ?? p.marketPrice ?? p.costBasis,
    companyName: p.companyName,
  }));

  await (prisma as any).stockPortfolioSnapshot.create({
    data: {
      portfolioId,
      strategyId: strategyId ?? null,
      snapshotDate,
      positionsJson: JSON.stringify(snapshotPositions),
      cashBalance,
      totalMarketValue: pnlSummary.totalMarketValue,
      totalCostBasis: pnlSummary.totalCostBasis,
      totalPnL: pnlSummary.totalPnL,
      sourceType: "OPEND",
    },
  });
}

/**
 * 获取最近的持仓快照（用于 drift 检测基准）
 */
export async function getLatestSnapshot(
  portfolioId: string,
  excludeStrategyId?: string
): Promise<{ positionsJson: string; cashBalance: number; totalPnL: number } | null> {
  const snapshot = await (prisma as any).stockPortfolioSnapshot.findFirst({
    where: {
      portfolioId,
      ...(excludeStrategyId ? { NOT: { strategyId: excludeStrategyId } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return snapshot ?? null;
}

// ==================================================================
// 5. 复盘实现 P&L 计算
// ==================================================================

/**
 * 基于上一条指南 vs 当前持仓，计算复盘 P&L 并归因
 */
export function computeRetroPnL(
  previousStrategyId: string,
  previousStrategyDate: string,
  previousActions: StrategyActionItem[],
  previousPositions: StockPositionItem[], // 指南发出时的持仓
  currentPositions: StockPositionItem[],  // 当前持仓
  quotesMap: Map<string, number>
): RetroPnLResult {
  const prevPosMap = new Map(previousPositions.map((p) => [p.symbol.toUpperCase(), p]));
  const currPosMap = new Map(currentPositions.map((p) => [p.symbol.toUpperCase(), p]));

  const followedActions: RetroPnLResult["followedActions"] = [];
  const missedActions: RetroPnLResult["missedActions"] = [];
  let avoidedLoss = 0;
  let totalRealizedPnL = 0;

  for (const action of previousActions) {
    if (action.action === "HOLD") continue;
    const symbol = action.symbol.toUpperCase();
    const currentPrice = quotesMap.get(symbol) ?? action.estimatedPrice;
    const prevPos = prevPosMap.get(symbol);
    const currPos = currPosMap.get(symbol);

    if (action.action === "BUY") {
      const wasExecuted = currPos && (!prevPos || currPos.shares > (prevPos?.shares ?? 0));
      if (wasExecuted) {
        const executedShares = currPos.shares - (prevPos?.shares ?? 0);
        const executedAt = currPos.costBasis; // 新仓位的成本就是执行价
        const realizedPnL = (currentPrice - executedAt) * executedShares;
        const vsGuidePnL = executedAt - action.estimatedPrice; // 执行价 vs 指南价差异

        followedActions.push({
          symbol,
          action: action.action,
          guidePrice: action.estimatedPrice,
          executedAt,
          realizedPnL: Number(realizedPnL.toFixed(2)),
          vsGuidePnL: Number(vsGuidePnL.toFixed(2)),
        });
        totalRealizedPnL += realizedPnL;
      } else {
        // 未执行的买入 — 机会成本（若当前价格比指南价涨了，就是错过的收益）
        const oppCost = (currentPrice - action.estimatedPrice) * action.suggestedShares;
        missedActions.push({
          symbol,
          action: action.action,
          guidePrice: action.estimatedPrice,
          currentPrice,
          opportunityCost: Number(oppCost.toFixed(2)),
        });
      }
    } else if (action.action === "TRIM" || action.action === "SELL") {
      const prevShares = prevPos?.shares ?? 0;
      const currShares = currPos?.shares ?? 0;
      const sharesReduced = prevShares - currShares;
      const wasExecuted = sharesReduced >= action.suggestedShares * 0.5; // 50% 视为已执行

      if (wasExecuted) {
        // 减仓后避免了多少损失（若当前价格低于指南价）
        if (currentPrice < action.estimatedPrice) {
          const avoided = sharesReduced * (action.estimatedPrice - currentPrice);
          avoidedLoss += avoided;
          followedActions.push({
            symbol,
            action: action.action,
            guidePrice: action.estimatedPrice,
            executedAt: action.estimatedPrice,
            realizedPnL: Number(avoided.toFixed(2)),
            vsGuidePnL: 0,
          });
        } else {
          followedActions.push({
            symbol,
            action: action.action,
            guidePrice: action.estimatedPrice,
            executedAt: action.estimatedPrice,
            realizedPnL: 0,
            vsGuidePnL: 0,
          });
        }
      } else {
        // 未减仓，但价格下跌 — 代价
        const oppCost = (action.estimatedPrice - currentPrice) * action.suggestedShares;
        missedActions.push({
          symbol,
          action: action.action,
          guidePrice: action.estimatedPrice,
          currentPrice,
          opportunityCost: Number(-Math.max(0, oppCost).toFixed(2)), // 负数表示本应避免的损失
        });
      }
    }
  }

  const executionMatchRate =
    previousActions.filter((a) => a.action !== "HOLD").length > 0
      ? followedActions.length / previousActions.filter((a) => a.action !== "HOLD").length
      : 1.0;

  // 指南质量得分：跟单率50% + P&L表现50%
  const pnlScore = Math.min(100, Math.max(0, 50 + totalRealizedPnL + avoidedLoss));
  const accuracyScore = Math.round(executionMatchRate * 50 + Math.min(50, pnlScore));

  // 提炼纪律
  const distilledDisciplines: string[] = [];
  for (const missed of missedActions) {
    if (missed.action === "TRIM" || missed.action === "SELL") {
      if (missed.opportunityCost < -20) {
        distilledDisciplines.push(
          `${missed.symbol} 减仓指令未执行，造成额外损失约 $${Math.abs(missed.opportunityCost).toFixed(0)}。高集中度持仓应在开盘 15 分钟内挂限价单。`
        );
      }
    } else if (missed.action === "BUY" && missed.opportunityCost > 20) {
      distilledDisciplines.push(
        `${missed.symbol} 买入机会未把握，错过 +$${missed.opportunityCost.toFixed(0)}。自选池标的有催化剂时应在开盘前挂单。`
      );
    }
  }

  return {
    strategyId: previousStrategyId,
    strategyDate: previousStrategyDate,
    accuracyScore,
    executionMatchRate: Number(executionMatchRate.toFixed(3)),
    followedActions,
    missedActions,
    avoidedLoss: Number(avoidedLoss.toFixed(2)),
    totalRealizedPnL: Number(totalRealizedPnL.toFixed(2)),
    distilledDisciplines,
  };
}

// ==================================================================
// 6. 记忆压缩：将旧指南浓缩为 ~150 tokens 摘要
// ==================================================================

// ==================================================================
// 6. 记忆压缩：将旧指南总结为高效文本摘要
// ==================================================================

export function compressStrategyToSummary(strategy: {
  strategyDate: string;
  mode?: string;
  retroPnLScore?: number | null;
  actionsJson: string;
  retroPnLJson?: string | null;
}): string {
  let actions: StrategyActionItem[] = [];
  try {
    actions = JSON.parse(strategy.actionsJson);
  } catch {}

  const activeActions = actions.filter((a) => a.action !== "HOLD");
  const actionSummary = activeActions.length > 0
    ? activeActions
        .map((a) => {
          const pnl = a.projectedPnL ? ` 预期${a.projectedPnL >= 0 ? "+" : ""}$${a.projectedPnL.toFixed(0)}` : "";
          const target = a.targetPrice ? ` 目标$${a.targetPrice}` : "";
          return `${a.action} ${a.symbol} ${a.suggestedShares}股${target}${pnl}`;
        })
        .join("; ")
    : "全仓观望/无调仓建议";

  const scoreStr = strategy.retroPnLScore != null ? `复盘得分${strategy.retroPnLScore.toFixed(0)}分` : "待复盘";
  const modeStr = strategy.mode ?? "FRESH";

  return `[${strategy.strategyDate}|${modeStr}|${scoreStr}] ${actionSummary}`;
}

// ==================================================================
// 7. 记忆组装：多维动态 Context 组装
// ==================================================================

export async function assembleContextBudget(
  portfolioId: string,
  positions: StockPositionItem[],
  cashBalance: number,
  customBudget: number,
  quotesMap: Map<string, number>,
  options?: {
    driftResult?: DriftResult;
    retroPnL?: RetroPnLResult;
    generationMode?: "FRESH" | "REPLAN" | "ADJUST";
  }
): Promise<{
  hotContext: string;
  warmContext: string;
  coldContext: string;
  freshContext: string;
  fullContextText: string;
  totalTokenEstimate: number;
}> {
  const mode = options?.generationMode ?? "FRESH";
  const totalPnL = computeTotalPnL(positions, cashBalance, quotesMap);

  // === HOT MEMORY ===
  const hotContext = formatTotalPnLContext(totalPnL) +
    `\n可用资金: 现金 $${cashBalance.toFixed(2)} + 计划预算 $${customBudget.toFixed(2)} = 合计 $${(cashBalance + customBudget).toFixed(2)}`;

  // === WARM MEMORY — 最近历史指南记录 + 知识图谱 ===
  const recentStrategies = await (prisma as any).stockDailyStrategy.findMany({
    where: { portfolioId, isArchived: false },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      strategyDate: true,
      mode: true,
      retroPnLScore: true,
      actionsJson: true,
      retroPnLJson: true,
      compressedSummary: true,
    },
  });

  const strategySummaries = recentStrategies.map((s: any) =>
    s.compressedSummary ?? compressStrategyToSummary(s)
  );

  // 知识图谱催化剂与关系链
  const kgSummaries: string[] = [];
  for (const pos of positions) {
    const kg = await stockKnowledgeGraphStoreService.getKnowledgeGraph(portfolioId, pos.symbol);
    if (kg) {
      const newsSnippet = (kg.newsCatalysts ?? []).join(" | ");
      const edgeSnippet = (kg.edges ?? []).map((e: any) => `${e.source}→${e.target}: ${e.relation}`).join("; ");
      if (newsSnippet || edgeSnippet) {
        kgSummaries.push(`${pos.symbol}: ${newsSnippet}${edgeSnippet ? " | 关系链: " + edgeSnippet : ""}`);
      }
    }
  }

  let warmContext = `【WARM MEMORY】近期指南记录:\n${strategySummaries.length > 0 ? strategySummaries.join("\n") : "暂无历史指南"}`;
  if (kgSummaries.length > 0) {
    warmContext += `\n\n各股最新催化剂与产业链:\n${kgSummaries.join("\n")}`;
  }

  // 复盘 P&L 摘要
  if (options?.retroPnL) {
    const retro = options.retroPnL;
    warmContext += `\n\n上次指南复盘 (${retro.strategyDate}, 得分${retro.accuracyScore}/100, 跟单率${(retro.executionMatchRate * 100).toFixed(0)}%):`;
    if (retro.followedActions.length > 0) {
      warmContext += `\n  已执行: ${retro.followedActions.map((a) => `${a.action} ${a.symbol} 实现P&L${a.realizedPnL >= 0 ? "+" : ""}$${a.realizedPnL.toFixed(0)}`).join(", ")}`;
    }
    if (retro.missedActions.length > 0) {
      warmContext += `\n  未执行: ${retro.missedActions.map((a) => `${a.action} ${a.symbol} 机会成本${a.opportunityCost >= 0 ? "+" : ""}$${a.opportunityCost.toFixed(0)}`).join(", ")}`;
    }
    if (retro.avoidedLoss > 0) {
      warmContext += `\n  避免损失: +$${retro.avoidedLoss.toFixed(0)}`;
    }
  }

  // === COLD MEMORY — 交易纪律账本 + P&L 统计 ===
  const disciplines = await (prisma as any).stockTradingDiscipline.findMany({
    where: { portfolioId, isDeprecated: false },
    orderBy: [{ isPinned: "desc" }, { confidence: "desc" }, { reinforceCount: "desc" }],
  });

  let coldContext = `【COLD MEMORY 交易纪律账本 (${disciplines.length} 条)】`;
  if (disciplines.length > 0) {
    coldContext += "\n" + disciplines.map((d: any) => {
      const stars = "★".repeat(Math.min(5, Math.round(d.confidence * 5)));
      const pin = d.isPinned ? "📌 " : "";
      const pnlTag = d.pnlEvidence !== 0
        ? ` [P&L证据${d.pnlEvidence >= 0 ? "+" : ""}$${d.pnlEvidence.toFixed(0)}]`
        : "";
      return `${pin}${stars} (强化${d.reinforceCount}次) ${d.disciplineText}${pnlTag}`;
    }).join("\n");
  } else {
    coldContext += "\n(暂无历史纪律，将从本次复盘开始积累)";
  }

  // 累积 P&L 统计
  const allStrategies = await (prisma as any).stockDailyStrategy.findMany({
    where: { portfolioId, retroPnLScore: { not: null } },
    select: { retroPnLScore: true, strategyDate: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  if (allStrategies.length > 0) {
    const avgScore = allStrategies.reduce((s: number, r: any) => s + (r.retroPnLScore ?? 0), 0) / allStrategies.length;
    coldContext += `\n\n累积指南统计 (近${allStrategies.length}次): 平均质量得分${avgScore.toFixed(0)}/100`;
  }

  // === FRESH CONTEXT — 今日新鲜数据 ===
  let freshContext = `【当日生成模式: ${mode}】`;

  if (mode === "REPLAN" && options?.driftResult) {
    freshContext += `\n⚡ 持仓已发生变化，触发重新推演:\n${options.driftResult.summary}`;
    freshContext += `\n变化详情:\n${options.driftResult.changes.map((c) =>
      `  ${c.type} ${c.symbol}: ${c.oldShares ?? 0}股→${c.newShares ?? 0}股 (~$${c.estimatedTradeValue?.toFixed(0) ?? "?"})`
    ).join("\n")}`;
  } else if (mode === "ADJUST") {
    freshContext += "\n🔄 持仓无变化，调整今日操盘目标（更新市场信息/行情变化）";
  } else {
    freshContext += "\n✨ 首次生成今日操盘指南";
  }

  const fullContextText = [hotContext, warmContext, coldContext, freshContext].join("\n\n");
  const totalTokenEstimate = Math.round(fullContextText.length / 2);

  return {
    hotContext,
    warmContext,
    coldContext,
    freshContext,
    fullContextText,
    totalTokenEstimate,
  };
}

// ==================================================================
// 8. 纪律蒸馏与同类项合并 (Discipline Deduplication & Consolidation)
// ==================================================================

/**
 * 规范化判断两条交易纪律是否属于同类法则
 */
function isSimilarDiscipline(d1Text: string, d2Text: string, symbol1?: string | null, symbol2?: string | null): boolean {
  if (symbol1 && symbol2 && symbol1.toUpperCase() !== symbol2.toUpperCase()) {
    return false;
  }
  // 提取两段文本的核心关键词（去除标点与助词）
  const clean1 = d1Text.replace(/[^\w\u4e00-\u9fa5]/g, "").toLowerCase();
  const clean2 = d2Text.replace(/[^\w\u4e00-\u9fa5]/g, "").toLowerCase();

  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    return true;
  }

  // 提取关键词交集比例
  const words1 = Array.from(new Set(clean1.split("")));
  const words2 = Array.from(new Set(clean2.split("")));
  const intersection = words1.filter((w) => words2.includes(w));
  const overlapRatio = intersection.length / Math.min(words1.length, words2.length);

  return overlapRatio > 0.75;
}

/**
 * 从复盘结果蒸馏新的交易纪律，并智能归并同类项更新强化计数
 */
export async function distillDisciplineFromRetro(
  portfolioId: string,
  retro: RetroPnLResult,
  strategyId: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  for (const disciplineText of retro.distilledDisciplines) {
    if (!disciplineText || disciplineText.length < 5) continue;

    // 提取相关股票 Symbol
    const symbolMatch = disciplineText.match(/^([A-Z]{2,5})\s/);
    const relatedSymbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;

    // 获取当前库中存活的全部纪律，做规范化语义/关键词重合度比对（代替原先死板的前20字截取）
    const activeDisciplines = await (prisma as any).stockTradingDiscipline.findMany({
      where: { portfolioId, isDeprecated: false },
    });

    const existingMatch = activeDisciplines.find((d: any) =>
      isSimilarDiscipline(d.disciplineText, disciplineText, d.relatedSymbol, relatedSymbol)
    );

    if (existingMatch) {
      // 归并强化已有纪律
      const newConfidence = Math.min(1.0, existingMatch.confidence + 0.1);
      await (prisma as any).stockTradingDiscipline.update({
        where: { id: existingMatch.id },
        data: {
          reinforceCount: { increment: 1 },
          confidence: newConfidence,
          pnlEvidence: existingMatch.pnlEvidence + (retro.avoidedLoss - Math.abs(retro.totalRealizedPnL < 0 ? retro.totalRealizedPnL : 0)),
          lastReinforced: today,
        },
      });
    } else {
      // 创建新纪律
      const pnlEvidence = retro.avoidedLoss > 0 ? retro.avoidedLoss : retro.totalRealizedPnL;

      await (prisma as any).stockTradingDiscipline.create({
        data: {
          portfolioId,
          disciplineText,
          relatedSymbol,
          pnlEvidence: Number(pnlEvidence.toFixed(2)),
          reinforceCount: 1,
          confidence: 0.4,
          lastReinforced: today,
          isPinned: false,
          isDeprecated: false,
          sourceStrategyId: strategyId,
        },
      });
    }
  }

  // 后台维护：归档过度沉淀且置信度低过 0.2 的陈旧过时纪律
  const deprecatedThreshold = await (prisma as any).stockTradingDiscipline.findMany({
    where: { portfolioId, isDeprecated: false, isPinned: false, confidence: { lt: 0.2 } },
  });

  for (const d of deprecatedThreshold) {
    await (prisma as any).stockTradingDiscipline.update({
      where: { id: d.id },
      data: { isDeprecated: true },
    });
  }
}

// ==================================================================
// 9. 记忆遗忘（异步后台清理）
// ==================================================================

/**
 * 后台记忆清理：归档旧指南，减少 Warm Memory 体积
 * 规则：超过 7 天且已有 retroPnLScore 的指南 → 归档
 */
export async function runForgettingPass(portfolioId: string): Promise<{ archived: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  // 归档已完成复盘且超过 7 天的指南
  const result = await (prisma as any).stockDailyStrategy.updateMany({
    where: {
      portfolioId,
      isArchived: false,
      strategyDate: { lt: cutoffStr },
      retroPnLScore: { not: null }, // 已复盘
    },
    data: { isArchived: true },
  });

  // 清理超过 90 天的持仓快照（保留每月末快照逻辑，简化实现：只保留最近 90 天）
  const snapshotCutoff = new Date();
  snapshotCutoff.setDate(snapshotCutoff.getDate() - 90);
  const snapshotCutoffStr = snapshotCutoff.toISOString().replace("T", " ").substring(0, 10);

  await (prisma as any).stockPortfolioSnapshot.deleteMany({
    where: {
      portfolioId,
      snapshotDate: { lt: snapshotCutoffStr },
    },
  });

  return { archived: result.count ?? 0 };
}
