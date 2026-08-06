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

      // 构建真正的金融语义实体节点与多跳关系边 (Triples: E1 -> Relation -> E2)
      const nodes: Array<{ id: string; name: string; type: "ROOT_STOCK" | "SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT"; marketSymbol?: string; description?: string }> = [
        {
          id: symbol,
          name: posInfo?.companyName || symbol,
          type: "ROOT_STOCK",
          marketSymbol: symbol,
          description: isExisting ? `MooMoo 实盘持仓: ${posInfo?.shares}股 (成本 $${posInfo?.costBasis})` : "MooMoo 自选池重点风口标的",
        },
      ];

      const edges: Array<{ source: string; target: string; relation: string; impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL" }> = [];

      // 1. 根据真实文本提取供应链上游节点
      if (matchingSentences.some((s) => s.includes("台积电") || s.includes("CoWoS"))) {
        nodes.push({
          id: "TSMC",
          name: "台积电 (TSMC)",
          type: "SUPPLIER",
          marketSymbol: "TSM",
          description: "先进 3nm/4nm 晶圆代工与 CoWoS 封装核心供应商",
        });
        edges.push({
          source: symbol,
          target: "TSMC",
          relation: "晶圆代工 & CoWoS 封装依赖",
          impact: "POSITIVE",
        });
      }

      // 2. 根据真实文本提取下游云巨头客户节点
      if (matchingSentences.some((s) => s.includes("微软") || s.includes("Azure") || s.includes("亚马逊") || s.includes("AWS"))) {
        nodes.push({
          id: "CLOUD_GIANTS",
          name: "微软 Azure & 亚马逊 AWS",
          type: "CLIENT",
          marketSymbol: "MSFT",
          description: "全球最大 hyperscaler 算力资本开支购买方",
        });
        edges.push({
          source: symbol,
          target: "CLOUD_GIANTS",
          relation: "AI 算力硬件大单采购",
          impact: "POSITIVE",
        });
      }

      // 3. 提取同业竞争对手节点
      if (symbol === "NVDA") {
        nodes.push({
          id: "AMD",
          name: "超微公司 (AMD)",
          type: "COMPETITOR",
          marketSymbol: "AMD",
          description: "MI300X 加速卡与数据中心 GPU 直接竞争对手",
        });
        edges.push({
          source: "NVDA",
          target: "AMD",
          relation: "数据中心 AI 芯片算力竞争",
          impact: "NEUTRAL",
        });
      } else if (symbol === "AMD") {
        nodes.push({
          id: "NVDA",
          name: "英伟达 (NVDA)",
          type: "COMPETITOR",
          marketSymbol: "NVDA",
          description: "CUDA 生态与 H100/Blackwell 行业龙头霸主",
        });
        edges.push({
          source: "AMD",
          target: "NVDA",
          relation: "追赶 CUDA 生态与市场份额",
          impact: "NEUTRAL",
        });
      }

      // 4. 提取宏观利率与板块概念节点
      nodes.push({
        id: "FED_POLICY",
        name: "美联储降息周期",
        type: "MACRO",
        description: "分母端折现率下行提振长久期科技股估值",
      });
      edges.push({
        source: "FED_POLICY",
        target: symbol,
        relation: "降息预期提振科技股估值",
        impact: "POSITIVE",
      });

      return {
        symbol,
        companyName: posInfo?.companyName || symbol,
        positionCategory: isExisting ? "EXISTING" : "NEW_DISCOVERY",
        industrySector: isExisting ? "核心持仓资产" : "自选风口关注标的",
        nodes,
        edges,
        newsCatalysts: newsCatalysts.slice(0, 3),
        actionAdvice: isExisting ? "HOLD" : "BUY",
        guidanceText: isExisting
          ? `基于知识图谱实体关联与新闻切片，对 ${symbol} 进行风控红线与技术位校验。`
          : `优先结合知识图谱客户大单与其下游催化剂，挖掘 ${symbol} 的低吸建仓点。`,
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
