import { prisma } from "../../../db/prisma";
import { openDaemonManager } from "./openDaemonManager";
import { moomooAdapter } from "../adapters/moomooAdapter";
import { stockKnowledgeGraphStoreService } from "./stockKnowledgeGraphStore";
import { DailyAllocationOutput, StockPositionItem, RetroPnLResult } from "../types/stockTypes";
import { stockAllocationPrompt } from "../../../prompting/prompts/stock/stock.prompts";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  computeTotalPnL,
  computeProjectedPnL,
  detectDrift,
  savePortfolioSnapshot,
  assembleContextBudget,
  distillDisciplineFromRetro,
  runForgettingPass,
  computeRetroPnL,
  compressStrategyToSummary,
  formatTotalPnLContext,
} from "./stockMemoryManager";

export class DailyStrategyDirector {
  /**
   * 为指定 Portfolio 生成今日开盘前的调仓指南与双视角研报 (Advisory Only)
   *
   * 新流程（10 步 P&L KPI 中轴线 + 四层记忆治理）：
   * 1. 确保 OpenD 运行
   * 2. 读取 DB portfolio
   * 3. 从 OpenD 拉取最新持仓 + 行情
   * 4. 持仓变化检测（detectDrift）
   * 5. 复盘上一条指南（retroPnL），回填 retroPnLScore
   * 6. 决定生成模式（FRESH / REPLAN / ADJUST）
   * 7. 组装四层 context（HOT/WARM/COLD/FRESH）
   * 8. AI 生成 + Guardrail 校准
   * 9. 计算 projectedPnL + 保存指南 + 保存快照
   * 10. 后台触发 distillDiscipline + runForgettingPass
   */
  public async generateDailyStrategy(portfolioId: string, customBudget?: number): Promise<{
    strategyId: string;
    strategyDate: string;
    openDStatus: { connected: boolean; message: string };
    output: DailyAllocationOutput;
    generationMode: string;
    totalPnL?: object;
    projectedPnL?: object;
    retroPnL?: object;
    driftSummary?: string;
  }> {
    // STEP 1: 确保 OpenD 运行
    const openDCheck = await openDaemonManager.ensureOpenDRunning();

    // STEP 2: 读取 DB portfolio 与持仓
    let portfolio = await prisma.stockPortfolio.findUnique({
      where: { id: portfolioId },
      include: { positions: true },
    });

    // STEP 3: 从 OpenD 拉取最新数据
    let openDPortfolio = await moomooAdapter.fetchPortfolioFromOpenD();
    let watchlistItems: Array<{ symbol: string; companyName: string }> = [];

    try {
      watchlistItems = await moomooAdapter.fetchWatchlistFromOpenD();
    } catch (e) {
      console.warn("[DailyStrategyDirector] Watchlist fetch notice:", e);
    }

    const openDPositions: StockPositionItem[] = openDPortfolio.positions ?? [];
    const openDCash = openDPortfolio.cashBalance ?? 0;

    // 如果 DB 无记录，用 OpenD 数据初始化
    if (!portfolio) {
      portfolio = await prisma.stockPortfolio.create({
        data: {
          id: portfolioId,
          name: "MooMoo 美股主仓位",
          cashBalance: openDCash,
          totalBudget: customBudget ?? 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: openDPositions.map((p: StockPositionItem) => ({
              symbol: p.symbol,
              companyName: p.companyName,
              shares: p.shares,
              costBasis: p.costBasis,
              marketPrice: p.marketPrice,
              notes: p.notes,
            })),
          },
        },
        include: { positions: true },
      });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const budgetToUse = customBudget !== undefined ? customBudget : portfolio.totalBudget;

    // 拉取实时行情
    const positionSymbols = portfolio.positions.map((p) => p.symbol);
    const watchlistSymbols = watchlistItems.map((item) => item.symbol);
    const allSymbols = Array.from(new Set([...positionSymbols, ...watchlistSymbols]));
    const realQuotes = await moomooAdapter.fetchMarketQuotes(allSymbols);
    const quotesMap = new Map<string, number>();
    for (const q of realQuotes) {
      if (q.symbol && q.price > 0) {
        quotesMap.set(q.symbol.toUpperCase(), q.price);
      }
    }

    // STEP 4: 持仓变化检测
    const dbPositions: StockPositionItem[] = portfolio.positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      companyName: p.companyName ?? undefined,
      shares: p.shares,
      costBasis: p.costBasis,
      marketPrice: p.marketPrice ?? undefined,
    }));

    const driftResult = detectDrift(dbPositions, openDPositions, portfolio.cashBalance, openDCash);

    // STEP 5: 查询最近历史指南，计算复盘 retroPnL
    const latestStrategy = await prisma.stockDailyStrategy.findFirst({
      where: { portfolioId },
      orderBy: { createdAt: "desc" },
    });

    let retroPnL: RetroPnLResult | undefined;

    if (latestStrategy && latestStrategy.actionsJson) {
      try {
        const prevActions = JSON.parse(latestStrategy.actionsJson) as StockPositionItem[];

        // 获取上次指南时的持仓快照
        const prevSnapshot = await (prisma as any).stockPortfolioSnapshot.findFirst({
          where: { portfolioId, strategyId: latestStrategy.id },
          orderBy: { createdAt: "desc" },
        });

        const prevPositions: StockPositionItem[] = prevSnapshot
          ? (() => {
              try {
                return JSON.parse(prevSnapshot.positionsJson);
              } catch {
                return dbPositions;
              }
            })()
          : dbPositions;

        retroPnL = computeRetroPnL(
          latestStrategy.id,
          latestStrategy.strategyDate,
          prevActions as any,
          prevPositions,
          openDPositions.length > 0 ? openDPositions : dbPositions,
          quotesMap
        );

        // 回填上一条指南的复盘数据
        await prisma.stockDailyStrategy.update({
          where: { id: latestStrategy.id },
          data: {
            retroPnLJson: JSON.stringify(retroPnL),
            retroPnLScore: retroPnL.accuracyScore,
            compressedSummary: compressStrategyToSummary({
              strategyDate: latestStrategy.strategyDate,
              mode: (latestStrategy as any).mode,
              retroPnLScore: retroPnL.accuracyScore,
              actionsJson: latestStrategy.actionsJson,
            }),
          } as any,
        });
      } catch (e) {
        console.warn("[DailyStrategyDirector] retroPnL computation error:", e);
      }
    }

    // STEP 6: 决定生成模式
    const hasTodayStrategy = latestStrategy?.strategyDate === todayStr;
    const generationMode: "FRESH" | "REPLAN" | "ADJUST" =
      driftResult.hasChanges ? "REPLAN" : hasTodayStrategy ? "ADJUST" : "FRESH";

    // STEP 7: 组装四层 context
    const memoryContext = await assembleContextBudget(
      portfolioId,
      openDPositions.length > 0 ? openDPositions : dbPositions,
      openDCash || portfolio.cashBalance,
      budgetToUse,
      quotesMap,
      {
        driftResult: driftResult.hasChanges ? driftResult : undefined,
        retroPnL,
        generationMode,
      }
    );

    // 实时 P&L 汇总
    const realPositions = openDPositions.length > 0 ? openDPositions : dbPositions;
    const totalPnL = computeTotalPnL(realPositions, openDCash || portfolio.cashBalance, quotesMap);

    // 格式化行情与持仓文本（含 P&L）
    const positionsFormatted = realPositions
      .map((p) => {
        const livePrice = quotesMap.get(p.symbol.toUpperCase()) || p.marketPrice || p.costBasis;
        const pnl = (livePrice - p.costBasis) * p.shares;
        const pnlSign = pnl >= 0 ? "+" : "";
        return `- 【${p.symbol} (${p.companyName || p.symbol})】持股: ${p.shares} 股 | 成本价: $${p.costBasis} | OpenD 实时现价: $${livePrice.toFixed(2)} | 浮盈: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${((pnl / (p.costBasis * p.shares)) * 100).toFixed(1)}%)`;
      })
      .join("\n");

    const watchlistFormatted = watchlistItems.length > 0
      ? watchlistItems.map((item) => {
          const livePrice = quotesMap.get(item.symbol.toUpperCase());
          return `- ${item.symbol} (${item.companyName})${livePrice ? ` [OpenD 实时现价: $${livePrice.toFixed(2)}]` : ""}`;
        }).join("\n")
      : "暂无自选关注项";

    const quotesTextList = realQuotes
      .map((q) => `- ${q.symbol}: $${q.price.toFixed(2)} (${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%)`)
      .join("\n");

    const marketIntelContext = `【OpenD 真实即时行情】(买卖建议估价必须以此价格为准)：\n${quotesTextList}\n\n- 宏观分析: 美股高位震荡，算力芯片与科技龙头表现坚挺。\n- 【严禁虚构价格指令】：调仓建议 actions 中的 estimatedPrice 必须与上述真实即时现价一致！`;

    // STEP 8: 调用 AI 生成 (图谱优先推理链驱动)
    const runResult = await runStructuredPrompt({
      asset: stockAllocationPrompt,
      promptInput: {
        strategyDate: todayStr,
        cashBalance: openDCash || portfolio.cashBalance,
        totalBudget: budgetToUse,
        riskPreference: portfolio.riskPreference,
        positionsJson: positionsFormatted,
        watchlistJson: watchlistFormatted,
        marketIntelContext,
        knowledgeGraphContext: memoryContext.warmContext,
        generationMode,
        currentTotalPnLContext: formatTotalPnLContext(totalPnL),
        positionChangesContext: driftResult.hasChanges ? driftResult.summary + "\n" + driftResult.changes.map((c) => `  ${c.type} ${c.symbol}: ${c.oldShares ?? 0}→${c.newShares ?? 0}股`).join("\n") : undefined,
        retroContext: retroPnL ? `指南 ${retroPnL.strategyDate} 得分${retroPnL.accuracyScore}/100，跟单率${(retroPnL.executionMatchRate * 100).toFixed(0)}%，避险+$${retroPnL.avoidedLoss.toFixed(0)}，实现P&L${retroPnL.totalRealizedPnL >= 0 ? "+" : ""}$${retroPnL.totalRealizedPnL.toFixed(0)}` : undefined,
        disciplineContext: memoryContext.coldContext,
        warmStrategySummaries: memoryContext.warmContext,
      },
    });

    const output: DailyAllocationOutput = runResult.output;

    // STEP 8.5: Guardrail 校准（0 AI 假股价 + 资金上限拦截）
    const totalAvailableCapital = (openDCash || portfolio.cashBalance) + budgetToUse;
    let runningBudgetLeft = totalAvailableCapital;

    if (output && Array.isArray(output.actions)) {
      output.actions = output.actions.map((act) => {
        const symbolUpper = String(act.symbol || "").toUpperCase();
        const livePriceFromOpenD = quotesMap.get(symbolUpper);
        let finalPrice = act.estimatedPrice;
        if (livePriceFromOpenD && livePriceFromOpenD > 0) {
          finalPrice = Number(livePriceFromOpenD.toFixed(2));
        }

        let finalShares = Math.max(0, Math.floor(act.suggestedShares || 0));
        if (act.action === "BUY" && finalPrice > 0) {
          const maxSharesAffordable = Math.floor(runningBudgetLeft / finalPrice);
          finalShares = Math.min(finalShares, maxSharesAffordable);
          runningBudgetLeft -= finalShares * finalPrice;
        }

        const finalAmount = Number((finalShares * finalPrice).toFixed(2));

        // 重新计算 projectedPnL（基于 OpenD 实时价 + AI 给出的 targetPrice）
        let projectedPnL = act.projectedPnL;
        let projectedPnLPct = act.projectedPnLPct;
        if (!projectedPnL && act.targetPrice && finalPrice > 0) {
          if (act.action === "BUY") {
            projectedPnL = Number(((act.targetPrice - finalPrice) * finalShares).toFixed(2));
            projectedPnLPct = Number((((act.targetPrice - finalPrice) / finalPrice) * 100).toFixed(2));
          }
        }

        return {
          ...act,
          symbol: symbolUpper,
          estimatedPrice: finalPrice,
          suggestedShares: finalShares,
          estimatedAmount: finalAmount,
          projectedPnL,
          projectedPnLPct,
        };
      });
    }

    // 计算指南整体预期 P&L
    const projectedPnL = computeProjectedPnL(output.actions || [], quotesMap);

    // STEP 9: 保存 KG + 指南 + 快照
    if (output.knowledgeGraph && Array.isArray(output.knowledgeGraph)) {
      for (const kgItem of output.knowledgeGraph) {
        try {
          await stockKnowledgeGraphStoreService.upsertKnowledgeGraph(portfolio.id, kgItem);
        } catch (e) {
          console.warn(`[DailyStrategyDirector] KG persist error for ${kgItem.symbol}:`, e);
        }
      }
    }

    const savedRecord = await prisma.stockDailyStrategy.create({
      data: {
        portfolioId: portfolio.id,
        strategyDate: todayStr,
        marketOverview: output.marketOverview,
        actionsJson: JSON.stringify(output.actions),
        riskAlertsJson: JSON.stringify(output.riskAlerts),
        institutionalReport: output.institutionalReport,
        narrativeReport: output.narrativeReport,
        status: "COMPLETED",
        // 记忆治理字段
        mode: generationMode,
        positionDriftJson: driftResult.hasChanges ? JSON.stringify(driftResult) : null,
        previousStrategyId: latestStrategy?.id ?? null,
        projectedPnLJson: JSON.stringify(projectedPnL),
        compressedSummary: compressStrategyToSummary({
          strategyDate: todayStr,
          mode: generationMode,
          actionsJson: JSON.stringify(output.actions),
        }),
      } as any,
    });

    // 保存持仓快照（绑定本次指南 ID）
    try {
      await savePortfolioSnapshot(portfolio.id, realPositions, openDCash || portfolio.cashBalance, quotesMap, savedRecord.id);
    } catch (e) {
      console.warn("[DailyStrategyDirector] Snapshot save error:", e);
    }

    // STEP 10: 后台异步 — 纪律蒸馏 + 记忆遗忘
    setImmediate(async () => {
      try {
        if (retroPnL) {
          await distillDisciplineFromRetro(portfolio!.id, retroPnL, savedRecord.id);
        }
        await runForgettingPass(portfolio!.id);
      } catch (e) {
        console.warn("[DailyStrategyDirector] Background memory maintenance error:", e);
      }
    });

    return {
      strategyId: savedRecord.id,
      strategyDate: todayStr,
      openDStatus: {
        connected: openDCheck.success,
        message: openDCheck.message,
      },
      output,
      generationMode,
      totalPnL: {
        totalPnL: totalPnL.totalPnL,
        totalPnLPct: totalPnL.totalPnLPct,
        totalMarketValue: totalPnL.totalMarketValue,
        netAssets: totalPnL.netAssets,
        positions: totalPnL.positions,
      },
      projectedPnL: {
        totalProjectedChange: projectedPnL.totalProjectedChange,
        byAction: projectedPnL.byAction,
      },
      retroPnL: retroPnL ? {
        accuracyScore: retroPnL.accuracyScore,
        executionMatchRate: retroPnL.executionMatchRate,
        avoidedLoss: retroPnL.avoidedLoss,
        totalRealizedPnL: retroPnL.totalRealizedPnL,
        strategyDate: retroPnL.strategyDate,
      } : undefined,
      driftSummary: driftResult.summary,
    };
  }
}

export const dailyStrategyDirector = new DailyStrategyDirector();
