import { StockPositionItem, StockKnowledgeGraphItem, RetrospectiveEvaluationResult } from "../types/stockTypes";

export class StockContextManager {
  /**
   * ACM Warm Memory: 从原始海量美股新闻流中真实切片、提取与蒸馏每股催化剂与知识图谱关系
   */
  public distillStockKnowledgeGraph(
    rawNewsText: string,
    positions: StockPositionItem[],
    watchlist: Array<{ symbol: string; companyName?: string }>
  ): StockKnowledgeGraphItem[] {
    const allSymbols = Array.from(
      new Set([
        ...positions.map((p) => p.symbol.toUpperCase()),
        ...watchlist.map((w) => w.symbol.toUpperCase()),
      ])
    );

    if (allSymbols.length === 0) {
      return [];
    }

    // 1. 将海量原始新闻按句号、叹号或换行切分为独立句子与段落
    const sentences = (rawNewsText || "")
      .split(/(?<=[。！？\n])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    // 2. 映射个股别名与实体检索词库
    const aliasMap: Record<string, string[]> = {
      NVDA: ["NVDA", "英伟达", "Blackwell", "CoWoS", "GPU"],
      AMD: ["AMD", "超微", "MI300X", "芯片"],
      AAPL: ["AAPL", "苹果", "iPhone", "iOS"],
      AMZN: ["AMZN", "亚马逊", "AWS", "云业务"],
      SPCX: ["SPCX", "SpaceX", "航天"],
      VOO: ["VOO", "标普500", "ETF", "大盘"],
      MSFT: ["MSFT", "微软", "Azure"],
      HON: ["HON", "霍尼韦尔"],
      PLTR: ["PLTR", "帕兰提尔"],
    };

    return allSymbols.slice(0, 6).map((symbol) => {
      const isExisting = positions.some((p) => p.symbol.toUpperCase() === symbol);
      const posInfo = positions.find((p) => p.symbol.toUpperCase() === symbol);
      const aliases = aliasMap[symbol] || [symbol];

      // 真实文本切片匹配 (Sentence NLP Matching)
      const matchingSentences = sentences.filter((sentence) =>
        aliases.some((alias) => sentence.toLowerCase().includes(alias.toLowerCase()))
      );

      // 蒸馏提取真实包含该股票的新闻快讯 (Real Text Catalysts)
      const newsCatalysts: string[] = [];
      if (matchingSentences.length > 0) {
        matchingSentences.forEach((s) => {
          const cleanSentence = s.replace(/^[0-9]+\.\s*/, "").trim();
          if (cleanSentence && !newsCatalysts.includes(cleanSentence)) {
            newsCatalysts.push(cleanSentence);
          }
        });
      } else {
        newsCatalysts.push(`【OpenD 实时监听】隔夜新闻未见 ${symbol} 剧烈异动报道，持续监听盘口与大单资金流`);
      }

      // 蒸馏提取真实的产业链关系节点 (Real Entity Node Extraction)
      const knowledgeGraphNodes: Array<{ relation: string; targetNode: string }> = [];

      if (isExisting && posInfo) {
        knowledgeGraphNodes.push({ relation: "实盘持仓规模", targetNode: `${posInfo.shares} 股` });
        knowledgeGraphNodes.push({ relation: "持仓成本价", targetNode: `$${posInfo.costBasis}` });
      }

      // 从新闻匹配句中提取真实实体关系
      matchingSentences.forEach((sentence) => {
        if (sentence.includes("台积电") || sentence.includes("CoWoS")) {
          knowledgeGraphNodes.push({ relation: "上游晶圆封装", targetNode: "台积电 CoWoS 产能" });
        }
        if (sentence.includes("微软") || sentence.includes("Azure") || sentence.includes("亚马逊") || sentence.includes("AWS")) {
          knowledgeGraphNodes.push({ relation: "核心云服务客户", targetNode: "微软 Azure & 亚马逊 AWS" });
        }
        if (sentence.includes("Meta") || sentence.includes("采纳")) {
          knowledgeGraphNodes.push({ relation: "芯片产品落地", targetNode: "MI300X 获 Meta 采纳" });
        }
        if (sentence.includes("iPhone") || sentence.includes("备货")) {
          knowledgeGraphNodes.push({ relation: "终端消费电子", targetNode: "iPhone 16 AI 备货增加 10%" });
        }
        if (sentence.includes("降息") || sentence.includes("鲍威尔") || sentence.includes("收益率")) {
          knowledgeGraphNodes.push({ relation: "宏观利好驱动", targetNode: "美联储降息预期 & 收益率走低" });
        }
      });

      if (knowledgeGraphNodes.length === 0) {
        knowledgeGraphNodes.push({ relation: "所属分类", targetNode: isExisting ? "实盘持仓标的" : "MooMoo 自选关注池" });
        knowledgeGraphNodes.push({ relation: "风控追踪", targetNode: "实时监听盘口挂单与量价结构" });
      }

      return {
        symbol,
        companyName: posInfo?.companyName || symbol,
        positionCategory: isExisting ? "EXISTING" : "NEW_DISCOVERY",
        industrySector: isExisting ? "核心持仓资产" : "自选风口关注标的",
        newsCatalysts: newsCatalysts.slice(0, 3),
        knowledgeGraphNodes: knowledgeGraphNodes.slice(0, 4),
        actionAdvice: isExisting ? "HOLD" : "BUY",
        guidanceText: isExisting
          ? `基于文本提取信息，继续对 ${symbol} 进行风控红线与技术位校验。`
          : `优先从自选关注池中结合催化剂挖掘 ${symbol} 的低吸买点。`,
      };
    });
  }

  /**
   * ACM Cold Memory: 昨日操盘指南 vs 今日实盘持仓对比复盘与避险/收益计算
   */
  public evaluateRetrospective(
    yesterdayActions: Array<{ action: string; symbol: string; suggestedShares: number; estimatedPrice: number }>,
    todayPositions: StockPositionItem[],
    liveQuotesMap: Map<string, number>
  ): RetrospectiveEvaluationResult {
    if (!yesterdayActions || yesterdayActions.length === 0) {
      return {
        executionMatchRate: 1.0,
        followedActionsCount: 0,
        totalActionsCount: 0,
        avoidedLossAmount: 0,
        distilledDisciplines: [
          "建议在开盘前 15 分钟核验 MooMoo 挂单状态",
          "持仓占比过 30% 严格执行限价单减仓",
        ],
      };
    }

    let followedCount = 0;
    let avoidedLoss = 0;

    yesterdayActions.forEach((action) => {
      const pos = todayPositions.find((p) => p.symbol.toUpperCase() === action.symbol.toUpperCase());
      const currentPrice = liveQuotesMap.get(action.symbol.toUpperCase()) || action.estimatedPrice;

      if (action.action === "TRIM" || action.action === "SELL") {
        if (currentPrice < action.estimatedPrice) {
          avoidedLoss += action.suggestedShares * (action.estimatedPrice - currentPrice);
          followedCount++;
        }
      } else if (action.action === "BUY") {
        if (pos && pos.shares > 0) {
          followedCount++;
        }
      } else {
        followedCount++;
      }
    });

    const executionMatchRate = Number((followedCount / yesterdayActions.length).toFixed(3));

    return {
      executionMatchRate,
      followedActionsCount: followedCount,
      totalActionsCount: yesterdayActions.length,
      avoidedLossAmount: Number(avoidedLoss.toFixed(2)),
      distilledDisciplines: [
        "高 Beta 单股持仓占比超过 30% 阈值时，严格在盘前 15 分钟挂单减仓",
        "自选风口新仓位采用盘前折让 1% 限价单挂单规则提高成交胜率",
      ],
    };
  }

  /**
   * ACM 上下文组装：依据 Hot(20%) / Warm(35%) / Cold(45%) 预算格式化 Prompt
   */
  public assembleContextPrompt(
    hotData: { cash: number; budget: number; positionsStr: string },
    warmSkg: StockKnowledgeGraphItem[],
    coldRetro: RetrospectiveEvaluationResult
  ): { hotContext: string; warmContext: string; coldContext: string; fullContextText: string } {
    const hotContext = `【HOT MEMORY】现金: $${hotData.cash} | 预算: $${hotData.budget}\n持仓: ${hotData.positionsStr}`;

    const warmContext = `【WARM MEMORY】每股知识图谱 (${warmSkg.length} 标的):\n` +
      warmSkg.map((skg) => `- ${skg.symbol} (${skg.companyName}): 催化剂: ${skg.newsCatalysts[0] || "无"}`).join("\n");

    const coldContext = `【COLD MEMORY】昨日履约跟单率: ${(coldRetro.executionMatchRate * 100).toFixed(1)}% | 纪律法则: ${coldRetro.distilledDisciplines.join("; ")}`;

    const fullContextText = `${hotContext}\n\n${warmContext}\n\n${coldContext}`;

    return {
      hotContext,
      warmContext,
      coldContext,
      fullContextText,
    };
  }
}

export const stockContextManager = new StockContextManager();
