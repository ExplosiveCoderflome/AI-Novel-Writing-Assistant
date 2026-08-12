import { prisma } from "../../../db/prisma";
import { openDaemonManager } from "./openDaemonManager";
import { moomooAdapter } from "../adapters/moomooAdapter";
import { stockKnowledgeGraphStoreService } from "./stockKnowledgeGraphStore";
import { searxngSearchService } from "./searxngSearchService";
import { stockContextManager } from "./stockContextManager";
import { DailyAllocationOutput, StockPositionItem, RetroPnLResult, StrategyProgressStage } from "../types/stockTypes";
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
   * 新流程（10 步 P&L KPI 中轴线 + 四层记忆治理 + SSE 流式推演进度通知）：
   * 1. 确保 OpenD 运行 (OPEND_CONNECT)
   * 2. 读取 DB portfolio
   * 3. 从 OpenD 拉取最新持仓 + 行情 (QUOTES_FETCH)
   * 4. 持仓变化检测（detectDrift）
   * 5. 复盘上一条指南（retroPnL），回填 retroPnLScore
   * 6. 决定生成模式（FRESH / REPLAN / ADJUST）
   * 7. 组装四层 context (NEWS_SEARCH & CONTEXT_ASSEMBLE)
   * 8. AI 生成 (AI_DEDUCTION) + Guardrail 校准 (GUARDRAIL_CALIBRATE)
   * 9. 计算 projectedPnL + 保存指南 + 保存快照
   * 10. 后台触发 distillDiscipline + runForgettingPass
   */
  public async generateDailyStrategy(
    portfolioId: string,
    customBudget?: number,
    onProgress?: (stage: StrategyProgressStage) => void
  ): Promise<{
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
    const notifyStage = (
      step: number,
      stageId: StrategyProgressStage["stageId"],
      title: string,
      detail: string,
      progressPercent: number
    ) => {
      if (onProgress) {
        onProgress({
          step,
          totalSteps: 6,
          stageId,
          title,
          detail,
          progressPercent,
          timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        });
      }
    };

    // STEP 1: 确保 OpenD 运行 (OPEND_CONNECT)
    notifyStage(1, "OPEND_CONNECT", "连接 MooMoo OpenD 守护进程", "正在测试本地 127.0.0.1:11111 TCP 原生通道连通性...", 10);
    const openDCheck = await openDaemonManager.ensureOpenDRunning();
    notifyStage(
      1,
      "OPEND_CONNECT",
      "连接 MooMoo OpenD 守护进程",
      openDCheck.success
        ? `🟢 OpenD 守护通道已连接 (${openDCheck.message})`
        : `⚠️ OpenD 守护通道提醒: ${openDCheck.message}`,
      15
    );

    // STEP 2: 读取 DB portfolio 与持仓
    let portfolio = await prisma.stockPortfolio.findUnique({
      where: { id: portfolioId },
      include: { positions: true },
    });

    // STEP 3: 从 OpenD 拉取最新数据 (QUOTES_FETCH)
    notifyStage(2, "QUOTES_FETCH", "抓取持仓与自选标的实盘行情", "正在从 OpenD 交易接口同步账号持仓与资产列表...", 25);
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
    notifyStage(
      2,
      "QUOTES_FETCH",
      "抓取持仓与自选标的实盘行情",
      `📈 已成功拉取 ${realQuotes.length} 笔标的实盘即时现价与动态涨跌幅`,
      35
    );

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

    // STEP 3.5: 尝试调用 SearXNG 抓取美股实时新闻 (NEWS_SEARCH)
    notifyStage(3, "NEWS_SEARCH", "SearXNG 隔夜美股宏观新闻检索", "正在请求本地 SearXNG 搜索引擎获取即时产业链资讯与宏观快讯...", 45);
    let rawSearXNGNewsText = "";
    let searxngStatusMsg = "";
    try {
      const searxngRes = await searxngSearchService.fetchAndCacheMarketNews(allSymbols);
      rawSearXNGNewsText = searxngRes.rawNewsText;
      searxngStatusMsg = searxngRes.searxngConnected
        ? `🟢 SearXNG 本地搜索引擎正常，成功检索并切片 ${searxngRes.newsItemsCount} 条实时新闻`
        : "⚠️ SearXNG 本地 Docker 容器未连通，已自动降级并使用存量知识图谱";
    } catch (e: any) {
      console.warn("[DailyStrategyDirector] SearXNG search notice:", e);
      searxngStatusMsg = `⚠️ SearXNG 检索 notice: ${e.message || e}`;
    }
    notifyStage(3, "NEWS_SEARCH", "SearXNG 隔夜美股宏观新闻检索", searxngStatusMsg, 55);

    // STEP 7: 组装四层 context (CONTEXT_ASSEMBLE)
    notifyStage(4, "CONTEXT_ASSEMBLE", "构建 Graph-First 四层记忆上下文", "正在整合 HOT (持仓P&L) / WARM (图谱/复盘) / COLD (纪律账本) 上下文...", 60);
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

    const newsIntelSnippet = rawSearXNGNewsText
      ? `【SearXNG 实时搜到的美股新闻快讯切片】:\n${rawSearXNGNewsText}\n\n`
      : "";

    const marketIntelContext = `【SearXNG 搜索引擎状态】：${searxngStatusMsg}\n\n${newsIntelSnippet}【OpenD 真实即时行情】(买卖建议估价必须以此价格为准)：\n${quotesTextList}\n\n- 宏观分析: 美股高位震荡，算力芯片与科技龙头表现坚挺。\n- 【严禁虚构价格指令】：调仓建议 actions 中的 estimatedPrice 必须与上述真实即时现价一致！`;

    notifyStage(4, "CONTEXT_ASSEMBLE", "构建 Graph-First 四层记忆上下文", `🕸️ 成功组装包含 ${realPositions.length} 笔持仓与 ${watchlistItems.length} 笔自选的图谱推理 Context`, 70);

    // STEP 8: 调用 AI 生成 (图谱优先推理链驱动 AI_DEDUCTION - 包含 4 步 breakdown 实时细化)
    notifyStage(5, "AI_DEDUCTION", "LLM 多维图谱推演 (1/4 盘口概览)", "AI 策略师正沿着【实体-关系-传导】逻辑链解析宏观流动性与科技龙头盘口...", 75);

    let lastNotifyTime = 0;
    let lastSubStage = "";

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
      options: {
        timeoutMs: 300000,
        onStreamChunk: (_delta, totalText) => {
          const now = Date.now();
          const len = totalText.length;

          let currentSubStage = "1/4 盘口概览";
          let subDetail = `🤖 [Breakdown 1/4]: 解析美股盘口与隔夜宏观快讯... (已生成 ${len} 字符)`;
          let subPct = 78;

          if (totalText.includes('"actions"') || len > 400) {
            currentSubStage = "2/4 传导推演";
            subDetail = `🤖 [Breakdown 2/4]: 正沿【实体-关系-传导】链计算持仓与自选量化建议... (已生成 ${len} 字符)`;
            subPct = 82;
          }
          if (totalText.includes('"institutionalReport"') || len > 1000) {
            currentSubStage = "3/4 机构研报";
            subDetail = `🤖 [Breakdown 3/4]: 撰写机构级产业链对冲与避险分析... (已生成 ${len} 字符)`;
            subPct = 86;
          }
          if (totalText.includes('"narrativeReport"') || len > 1800) {
            currentSubStage = "4/4 操盘蓝图";
            subDetail = `🤖 [Breakdown 4/4]: 整理开盘前三格操盘蓝图与双视角细节... (已生成 ${len} 字符)`;
            subPct = 89;
          }

          if (currentSubStage !== lastSubStage || now - lastNotifyTime >= 350) {
            lastSubStage = currentSubStage;
            lastNotifyTime = now;
            notifyStage(
              5,
              "AI_DEDUCTION",
              `LLM 多维图谱推演 (${currentSubStage})`,
              subDetail,
              subPct
            );
          }
        },
      },
    });

    const output: DailyAllocationOutput = runResult.output;
    notifyStage(5, "AI_DEDUCTION", "LLM 智能体多维图谱推演与研报撰写", `🤖 AI 已完成初稿推演，共生成 ${output.actions?.length || 0} 笔推荐指令与双视角研报`, 90);

    // STEP 8.5: Guardrail 校准 (GUARDRAIL_CALIBRATE)
    notifyStage(6, "GUARDRAIL_CALIBRATE", "确定性风控与止盈止损数学校准", "正在执行 OpenD 价格硬锁定、资金预算拦截与止盈止损 R:R 数数学公式校验...", 95);
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

        // 止盈价与止损价确定性防线校准
        let targetPrice = act.targetPrice;
        let stopLossPrice = act.stopLossPrice;

        if (finalPrice > 0) {
          if (act.action === "BUY") {
            // 止盈价默认预留 +12% 空间（若 AI 未设定或低于现价）
            if (!targetPrice || targetPrice <= finalPrice) {
              targetPrice = Number((finalPrice * 1.12).toFixed(2));
            }
            // 止损价默认预留 -5% 警戒线（若 AI 未设定或高于现价）
            if (!stopLossPrice || stopLossPrice >= finalPrice) {
              stopLossPrice = Number((finalPrice * 0.95).toFixed(2));
            }
          } else if (act.action === "TRIM" || act.action === "SELL") {
            if (!targetPrice) {
              targetPrice = Number((finalPrice * 1.05).toFixed(2));
            }
            if (!stopLossPrice || stopLossPrice >= finalPrice) {
              stopLossPrice = Number((finalPrice * 0.92).toFixed(2));
            }
          } else {
            if (!targetPrice) {
              targetPrice = Number((finalPrice * 1.10).toFixed(2));
            }
            if (!stopLossPrice) {
              stopLossPrice = Number((finalPrice * 0.93).toFixed(2));
            }
          }
        }

        const takeProfitPct = finalPrice > 0 && targetPrice ? Number((((targetPrice - finalPrice) / finalPrice) * 100).toFixed(1)) : undefined;
        const stopLossPct = finalPrice > 0 && stopLossPrice ? Number((((finalPrice - stopLossPrice) / finalPrice) * 100).toFixed(1)) : undefined;

        // 盈亏比 Risk-Reward Ratio (R:R)
        let riskRewardRatio = act.riskRewardRatio;
        if (takeProfitPct !== undefined && stopLossPct !== undefined && stopLossPct > 0) {
          riskRewardRatio = Number((takeProfitPct / stopLossPct).toFixed(2));
        }

        // 重新计算 projectedPnL（基于 OpenD 实时价 + 校准后的 targetPrice）
        let projectedPnL = act.projectedPnL;
        let projectedPnLPct = act.projectedPnLPct;
        if ((!projectedPnL || projectedPnL === 0) && targetPrice && finalPrice > 0 && finalShares > 0) {
          if (act.action === "BUY") {
            projectedPnL = Number(((targetPrice - finalPrice) * finalShares).toFixed(2));
            projectedPnLPct = Number((((targetPrice - finalPrice) / finalPrice) * 100).toFixed(2));
          }
        }

        return {
          ...act,
          symbol: symbolUpper,
          estimatedPrice: finalPrice,
          suggestedShares: finalShares,
          estimatedAmount: finalAmount,
          targetPrice,
          stopLossPrice,
          riskRewardRatio,
          takeProfitPct,
          stopLossPct,
          projectedPnL,
          projectedPnLPct,
        };
      });
    }

    // 持仓止盈止损线自动预警检测
    if (!output.riskAlerts) {
      output.riskAlerts = [];
    }

    for (const pos of realPositions) {
      const livePrice = quotesMap.get(pos.symbol.toUpperCase()) || pos.marketPrice || pos.costBasis;
      if (pos.costBasis > 0 && livePrice > 0) {
        const pnlPct = ((livePrice - pos.costBasis) / pos.costBasis) * 100;
        // 浮亏触及 7% 跌幅线
        if (pnlPct <= -7.0) {
          output.riskAlerts.unshift({
            level: "CRITICAL",
            title: `🚨 触及止损警戒线: ${pos.symbol}`,
            description: `${pos.companyName || pos.symbol} 当前现价 $${livePrice.toFixed(2)} 较成本价 $${pos.costBasis.toFixed(2)} 累计下跌 ${Math.abs(pnlPct).toFixed(1)}%（超出 7.0% 止损阈值），建议执行严格止损或减仓避险。`,
            relatedSymbol: pos.symbol,
          });
        } else if (pnlPct >= 15.0) {
          // 浮盈达到 15% 止盈线
          output.riskAlerts.unshift({
            level: "INFO",
            title: `🎯 达标止盈止盈目标: ${pos.symbol}`,
            description: `${pos.companyName || pos.symbol} 当前现价 $${livePrice.toFixed(2)} 较成本价 $${pos.costBasis.toFixed(2)} 累计上涨 +${pnlPct.toFixed(1)}%（达到 15.0% 止盈收益目标），建议分批锁定利润。`,
            relatedSymbol: pos.symbol,
          });
        }
      }
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

    notifyStage(6, "FINISHED", "开盘操盘指南生成完毕", "所有策略、风控预警、止盈止损线与双视角研报均已成功计算并持久化", 100);

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
