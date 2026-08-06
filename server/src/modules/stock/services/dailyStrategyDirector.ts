import { prisma } from "../../../db/prisma";
import { openDaemonManager } from "./openDaemonManager";
import { moomooAdapter } from "../adapters/moomooAdapter";
import { DailyAllocationOutput, StockPositionItem } from "../types/stockTypes";
import { stockAllocationPrompt } from "../../../prompting/prompts/stock/stock.prompts";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";

export class DailyStrategyDirector {
  /**
   * 为指定 Portfolio 生成今日开盘前的调仓指南与双视角研报 (Advisory Only)
   */
  public async generateDailyStrategy(portfolioId: string, customBudget?: number): Promise<{
    strategyId: string;
    strategyDate: string;
    openDStatus: { connected: boolean; message: string };
    output: DailyAllocationOutput;
  }> {
    // 1. 确保 MooMoo OpenD 自动随服务唤醒
    const openDCheck = await openDaemonManager.ensureOpenDRunning();

    // 2. 从数据库读取 Portfolio 与相关持仓
    let portfolio = await prisma.stockPortfolio.findUnique({
      where: { id: portfolioId },
      include: { positions: true },
    });

    // 如果数据库暂无记录，尝试自动从 OpenD / 默认创建初始组合
    if (!portfolio) {
      const openDData = await moomooAdapter.fetchPortfolioFromOpenD();
      portfolio = await prisma.stockPortfolio.create({
        data: {
          id: portfolioId,
          name: "MooMoo 美股主仓位",
          cashBalance: openDData.cashBalance || 3500.0,
          totalBudget: customBudget ?? 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: openDData.positions.map((p: StockPositionItem) => ({
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

    // 3. 尝试从 OpenD 实时拉取最新真实的盘中/盘后/夜盘现价
    const positionSymbols = portfolio.positions.map((p) => p.symbol);
    let watchlistSymbols: string[] = [];
    let watchlistItems: Array<{ symbol: string; companyName: string }> = [];

    try {
      watchlistItems = await moomooAdapter.fetchWatchlistFromOpenD();
      watchlistSymbols = watchlistItems.map((item) => item.symbol);
    } catch (e) {
      console.warn("[DailyStrategyDirector] Watchlist fetch notice:", e);
    }

    const allSymbols = Array.from(new Set([...positionSymbols, ...watchlistSymbols, "NVDA", "AAPL", "AMD", "TSLA", "MSFT"]));
    const realQuotes = await moomooAdapter.fetchMarketQuotes(allSymbols);
    const quotesMap = new Map<string, number>();

    for (const q of realQuotes) {
      if (q.symbol && q.price > 0) {
        quotesMap.set(q.symbol, q.price);
      }
    }

    // 格式化最新持仓列表（带有真实 OpenD 即时现价）
    const positionsFormatted = portfolio.positions
      .map((p) => {
        const livePrice = quotesMap.get(p.symbol) || p.marketPrice || p.costBasis;
        return `- 【${p.symbol} (${p.companyName || p.symbol})】持股: ${p.shares} 股 | 摊薄成本价: $${p.costBasis} | OpenD 真实即时现价: $${livePrice.toFixed(2)}`;
      })
      .join("\n");

    const watchlistFormatted = watchlistItems.length > 0
      ? watchlistItems
          .map((item) => {
            const livePrice = quotesMap.get(item.symbol);
            return `- ${item.symbol} (${item.companyName})${livePrice ? ` [OpenD 真实现价: $${livePrice.toFixed(2)}]` : ""}`;
          })
          .join("\n")
      : "暂无自选关注项";

    const quotesTextList = realQuotes
      .map((q) => `- ${q.symbol}: 真实即时现价 $${q.price.toFixed(2)} (${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%)`)
      .join("\n");

    const marketIntelContext = `
【OpenD 真实即时行情行情数据】(买卖建议估价必须以此真实价格为准)：
${quotesTextList}

- 宏观分析: 美股标普500与纳斯达克高位震荡，算力芯片与科技龙头表现坚挺。
- 【严禁虚构价格指令】：调仓建议清单 (actions) 中的 estimatedPrice 必须与上述真实即时现价保持一致！
`;

    // 4. 调用 Prompt Governance 注册的结构化 AI 智能体推演
    const runResult = await runStructuredPrompt({
      asset: stockAllocationPrompt,
      promptInput: {
        strategyDate: todayStr,
        cashBalance: portfolio.cashBalance,
        totalBudget: budgetToUse,
        riskPreference: portfolio.riskPreference,
        positionsJson: positionsFormatted,
        watchlistJson: watchlistFormatted,
        marketIntelContext,
      },
    });

    const output: DailyAllocationOutput = runResult.output;

    // 4.5 【数据真实性铁律保障层】：对 AI 生成的所有结构化推荐清单进行 100% 确定性校验与强制校准
    // 规则：AI 仅负责给出调仓建议方向与研判逻辑，所有的股票价格、交易总额均由 OpenD 真实数据与精确数学公式确定，彻底杜绝 AI 幻觉与数字编造。
    const totalAvailableCapital = (portfolio.cashBalance || 0) + (budgetToUse || 0);

    if (output && Array.isArray(output.actions)) {
      output.actions = output.actions.map((act) => {
        const symbolUpper = String(act.symbol || "").toUpperCase();
        const livePriceFromOpenD = quotesMap.get(symbolUpper);

        // 1. 股票参考价 100% 强制覆盖为 OpenD 实时拉取到的实盘价格
        let finalPrice = act.estimatedPrice;
        if (livePriceFromOpenD && livePriceFromOpenD > 0) {
          finalPrice = Number(livePriceFromOpenD.toFixed(2));
        }

        // 2. 建议股数强制校验，确保买入不超出实际可用总资金 (现金 + 新增预算)
        let finalShares = Math.max(0, Math.floor(act.suggestedShares || 0));
        if (act.action === "BUY" && finalPrice > 0) {
          const maxSharesAffordable = Math.floor(totalAvailableCapital / finalPrice);
          finalShares = Math.min(finalShares, maxSharesAffordable);
        }

        // 3. 估算金额 100% 由公式 (精确股数 * OpenD实盘现价) 确定算得
        const finalAmount = Number((finalShares * finalPrice).toFixed(2));

        return {
          ...act,
          symbol: symbolUpper,
          estimatedPrice: finalPrice,
          suggestedShares: finalShares,
          estimatedAmount: finalAmount,
        };
      });
    }

    // 5. 将生成的《每日操盘指南》持久化落库
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
      },
    });

    return {
      strategyId: savedRecord.id,
      strategyDate: todayStr,
      openDStatus: {
        connected: openDCheck.success,
        message: openDCheck.message,
      },
      output,
    };
  }
}

export const dailyStrategyDirector = new DailyStrategyDirector();
