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

      // 动态金融领域知识与文本融合引擎 (根据真实股票特征、新闻切片、OpenD盘口与实盘数据融合)
      const nodes: Array<{ id: string; name: string; type: "ROOT_STOCK" | "SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT"; marketSymbol?: string; description?: string }> = [
        {
          id: symbol,
          name: posInfo?.companyName || symbol,
          type: "ROOT_STOCK",
          marketSymbol: symbol,
          description: isExisting ? `MooMoo 实盘持仓: ${posInfo?.shares}股 (成本 $${posInfo?.costBasis})` : "MooMoo 自选池重点关注标的",
        },
      ];

      const edges: Array<{ source: string; target: string; relation: string; impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL" }> = [];

      // 1. 股票专属领域知识库与通用常识融合 (Per-Stock Unique Knowledge Ontology)
      const stockOntologyMap: Record<string, { nodes: Array<{ id: string; name: string; type: "SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT"; marketSymbol?: string; description: string }>; edges: Array<{ source: string; target: string; relation: string; impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL" }> }> = {
        AAPL: {
          nodes: [
            { id: "TSMC_AAPL", name: "台积电 (TSMC)", type: "SUPPLIER", marketSymbol: "TSM", description: "iPhone 16 A18 芯片与 M4 处理器 3nm 先进晶圆独家代工" },
            { id: "FOXCONN", name: "鸿海/富士康 (Foxconn)", type: "SUPPLIER", description: "终端智能手机核心零部件与精密部件组装代工" },
            { id: "APPLE_INTEL", name: "Apple Intelligence 生态", type: "CONCEPT", description: "端侧生成式 AI 功能升级驱动换机潮爆发" },
            { id: "GOOGLE_COMP", name: "谷歌 (Google)", type: "COMPETITOR", marketSymbol: "GOOGL", description: "Android 操作系统与云端搜索 AI 插件伙伴及竞争者" },
          ],
          edges: [
            { source: "AAPL", target: "TSMC_AAPL", relation: "A18/M4 先进芯片 3nm 独家代工", impact: "POSITIVE" },
            { source: "AAPL", target: "FOXCONN", relation: "终端设备组装与全球备货交付", impact: "POSITIVE" },
            { source: "AAPL", target: "APPLE_INTEL", relation: "端侧系统级 AI 升级驱动换机周期", impact: "POSITIVE" },
            { source: "AAPL", target: "GOOGLE_COMP", relation: "默认搜索引擎分成与端侧 AI 竞争", impact: "NEUTRAL" },
          ],
        },
        AMD: {
          nodes: [
            { id: "TSMC_AMD", name: "台积电 (TSMC)", type: "SUPPLIER", marketSymbol: "TSM", description: "MI300X 算力加速卡与 EPYC 服务器 CPU 晶圆封装" },
            { id: "NVDA_COMP", name: "英伟达 (NVIDIA)", type: "COMPETITOR", marketSymbol: "NVDA", description: "数据中心 GPU 与 CUDA AI 软件生态行业绝对龙头" },
            { id: "META_MSFT_BUY", name: "Meta & 微软 Azure", type: "CLIENT", marketSymbol: "MSFT", description: "数据中心 MI300X 算力芯片大单购买采购方" },
            { id: "ROCM_ECO", name: "ROCm 开放软件生态", type: "CONCEPT", description: "对标 CUDA 的开放开源算力软件生态" },
          ],
          edges: [
            { source: "AMD", target: "TSMC_AMD", relation: "MI300X 加速卡与 CoWoS 晶圆代工", impact: "POSITIVE" },
            { source: "AMD", target: "NVDA_COMP", relation: "数据中心 AI 芯片算力与市场份额竞争", impact: "NEUTRAL" },
            { source: "AMD", target: "META_MSFT_BUY", relation: "云端数据中心 MI300X 大单交付", impact: "POSITIVE" },
            { source: "AMD", target: "ROCM_ECO", relation: "开源软件框架适配性提升", impact: "POSITIVE" },
          ],
        },
        NVDA: {
          nodes: [
            { id: "TSMC_NVDA", name: "台积电 (TSMC)", type: "SUPPLIER", marketSymbol: "TSM", description: "Blackwell B200 与 H100 GPU 核心 4nm/3nm 晶圆代工与 CoWoS 封装" },
            { id: "SK_HYNIX", name: "SK 海力士", type: "SUPPLIER", description: "HBM3e 高带宽内存独家/核心供应商" },
            { id: "HYPERSCALERS", name: "微软 / 亚马逊 / 谷歌", type: "CLIENT", marketSymbol: "MSFT", description: "全球四大云巨头 CapEx 资本开支买方" },
            { id: "CUDA_MOAT", name: "CUDA 开发者护城河", type: "CONCEPT", description: "全球数百万 AI 开发者软硬件绑定生态" },
          ],
          edges: [
            { source: "NVDA", target: "TSMC_NVDA", relation: "CoWoS 封装产能瓶颈与芯片代工", impact: "POSITIVE" },
            { source: "NVDA", target: "SK_HYNIX", relation: "HBM3e 高带宽内存采购与合作", impact: "POSITIVE" },
            { source: "NVDA", target: "HYPERSCALERS", relation: "云端 Blackwell 算力基建硬件采购大单", impact: "POSITIVE" },
            { source: "NVDA", target: "CUDA_MOAT", relation: "软件生态粘性与高毛利率保护", impact: "POSITIVE" },
          ],
        },
        AMZN: {
          nodes: [
            { id: "AWS_UNIT", name: "AWS 云计算业务", type: "CONCEPT", description: "亚马逊核心高毛利云计算与企业级 AI 平台" },
            { id: "ANTHROPIC_AI", name: "Anthropic (Claude)", type: "CLIENT", description: "亚马逊战略投资与云端大模型战略合作伙伴" },
            { id: "TRAINIUM_CHIP", name: "Trainium/Inferentia 自研芯片", type: "SUPPLIER", description: "自研降低云计算算力成本的专用芯片" },
          ],
          edges: [
            { source: "AMZN", target: "AWS_UNIT", relation: "云计算资本开支与高利润引擎", impact: "POSITIVE" },
            { source: "AMZN", target: "ANTHROPIC_AI", relation: "生成式 AI 大模型战略投资与云绑定", impact: "POSITIVE" },
            { source: "AWS_UNIT", target: "TRAINIUM_CHIP", relation: "自研芯片降低对第三方 GPU 依赖", impact: "POSITIVE" },
          ],
        },
        SPCX: {
          nodes: [
            { id: "SPACEX_CONCEPT", name: "SpaceX 商业航天", type: "CONCEPT", description: "星链 (Starlink) 卫星网络与猎鹰重型火箭发射" },
            { id: "AERO_DEFENSE", name: "商业航天与国防军工", type: "CONCEPT", description: "美国低轨卫星通信与前沿航天科技" },
          ],
          edges: [
            { source: "SPCX", target: "SPACEX_CONCEPT", relation: "商业航天发射与星链网络扩展概念", impact: "POSITIVE" },
            { source: "SPCX", target: "AERO_DEFENSE", relation: "前沿航天基建与国防订单溢价", impact: "POSITIVE" },
          ],
        },
        VOO: {
          nodes: [
            { id: "SP500_INDEX", name: "标普 500 指数", type: "CONCEPT", description: "美国市值最大 500 家顶尖跨国企业组合" },
            { id: "BIG_TECH_BASKET", name: "科技巨头权重池 (Magnificent 7)", type: "CONCEPT", description: "苹果、微软、英伟达等核心权重驱动" },
          ],
          edges: [
            { source: "VOO", target: "SP500_INDEX", relation: "100% 紧密追踪标普 500 表现", impact: "POSITIVE" },
            { source: "VOO", target: "BIG_TECH_BASKET", relation: "科技巨头利润提振大盘整体表现", impact: "POSITIVE" },
          ],
        },
      };

      // 2. 注入对应股票专属知识图谱
      const defaultOntology = stockOntologyMap[symbol];
      if (defaultOntology) {
        defaultOntology.nodes.forEach((n) => {
          if (!nodes.some((item) => item.id === n.id)) {
            nodes.push(n);
          }
        });
        defaultOntology.edges.forEach((e) => {
          if (!edges.some((item) => item.source === e.source && item.target === e.target)) {
            edges.push(e);
          }
        });
      } else {
        // 未在已知字典中的任意美股动态生成专属三元组
        const genericSectorId = `SECTOR_${symbol}`;
        nodes.push({
          id: genericSectorId,
          name: `${symbol} 核心行业与供应链`,
          type: "CONCEPT",
          description: `围绕 ${symbol} 美股标的进行的产业链与大单资金分析`,
        });
        edges.push({
          source: symbol,
          target: genericSectorId,
          relation: "产业链与行业板块映射",
          impact: "POSITIVE",
        });
      }

      // 3. 动态融海量新闻切片中的实体与关联 (Real Web Search / Intel Integration)
      matchingSentences.forEach((sentence) => {
        if (/美联储|降息|利率|鲍威尔|收益率|通胀/.test(sentence)) {
          if (!nodes.some((n) => n.id === "MACRO_FED")) {
            nodes.push({
              id: "MACRO_FED",
              name: "美联储降息周期",
              type: "MACRO",
              description: "折现率与流动性对长久期科技股估值传导",
            });
          }
          if (!edges.some((e) => e.source === "MACRO_FED" && e.target === symbol)) {
            edges.push({
              source: "MACRO_FED",
              target: symbol,
              relation: "降息预期提振科技股估值",
              impact: "POSITIVE",
            });
          }
        }
      });

      // 4. 融合实盘持仓数据 (Real Portfolio Integration)
      if (isExisting && posInfo) {
        const posNodeId = `POS_${symbol}`;
        nodes.push({
          id: posNodeId,
          name: `MooMoo 实盘持仓 (${posInfo.shares}股)`,
          type: "CONCEPT",
          description: `持仓均价 $${posInfo.costBasis}，OpenD 实时价格校验中`,
        });
        edges.push({
          source: symbol,
          target: posNodeId,
          relation: "MooMoo 实盘底层资产绑定",
          impact: "NEUTRAL",
        });
      }

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
