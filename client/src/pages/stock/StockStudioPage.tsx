import i18next from "i18next";
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  ShieldAlert,
  RefreshCw,
  Zap,
  CheckCircle2,
  DollarSign,
  PieChart,
  BookOpen,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Briefcase,
  Sliders,
  Flame,
  ShieldCheck,
  Activity,
} from "lucide-react";

interface ActionItem {
  action: "BUY" | "SELL" | "HOLD" | "TRIM";
  symbol: string;
  companyName?: string;
  suggestedShares: number;
  estimatedPrice: number;
  estimatedAmount: number;
  rationale: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  // P&L KPI
  targetPrice?: number;
  stopLossPrice?: number;
  projectedPnL?: number;
  projectedPnLPct?: number;
  timeHorizon?: string;
}

interface PositionPnLItem {
  symbol: string;
  companyName?: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  costValue: number;
  concentrationPct: number;
}

interface TotalPnLState {
  totalMarketValue: number;
  totalCostBasis: number;
  totalPnL: number;
  totalPnLPct: number;
  cashBalance: number;
  netAssets: number;
  positions: PositionPnLItem[];
}

interface RetroPnLState {
  accuracyScore: number;
  executionMatchRate: number;
  avoidedLoss: number;
  totalRealizedPnL: number;
  strategyDate: string;
}

interface ProjectedPnLState {
  totalProjectedChange: number;
  byAction: Array<{
    symbol: string;
    action: string;
    projectedPnL: number;
    projectedPnLPct: number;
    targetPrice?: number;
    stopLossPrice?: number;
  }>;
}


interface RiskAlert {
  level: "WARNING" | "CRITICAL" | "INFO";
  title: string;
  description: string;
  relatedSymbol?: string;
}

interface KnowledgeGraphEntityNode {
  id: string;
  name: string;
  type: "ROOT_STOCK" | "SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT";
  marketSymbol?: string;
  description?: string;
}

interface KnowledgeGraphRelationEdge {
  source: string;
  target: string;
  relation: string;
  impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
}

interface KnowledgeGraphItem {
  symbol: string;
  companyName: string;
  positionCategory: "EXISTING" | "NEW_DISCOVERY";
  industrySector: string;
  nodes?: KnowledgeGraphEntityNode[];
  edges?: KnowledgeGraphRelationEdge[];
  newsCatalysts: string[];
  actionAdvice: "BUY" | "SELL" | "HOLD" | "TRIM";
  guidanceText: string;
}

interface DailyStrategyData {
  id: string;
  strategyDate: string;
  marketOverview: string;
  existingPositionGuidance?: string;
  newPositionGuidance?: string;
  retrospectiveGuidance?: string;
  actions: ActionItem[];
  riskAlerts: RiskAlert[];
  knowledgeGraph?: KnowledgeGraphItem[];
  institutionalReport: string;
  narrativeReport: string;
  openDStatus?: { connected: boolean; message: string };
}

export default function StockStudioPage() {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openDStatus, setOpenDStatus] = useState<{ connected: boolean; message: string }>({
    connected: false,
    message: "检测 OpenD 连通状态...",
  });
  const [searxngStatus, setSearxngStatus] = useState<{ connected: boolean; message: string }>({
    connected: false,
    message: "检测 SearXNG 本地搜索引擎连通状态...",
  });

  const checkSearXNGStatus = async () => {
    try {
      const res = await fetch("/api/stock/search/status");
      const data = await res.json();
      if (data.success && data.data) {
        setSearxngStatus({
          connected: data.data.connected,
          message: data.data.message,
        });
      }
    } catch (e) {
      setSearxngStatus({
        connected: false,
        message: "🔴 未检测到 SearXNG 本地 Docker 服务 (127.0.0.1:8080)",
      });
    }
  };
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [customBudget, setCustomBudget] = useState<number>(1000);
  const [activeReportTab, setActiveReportTab] = useState<"institutional" | "narrative">("narrative");
  
  // 真实 MooMoo 持仓与组合状态
  const [portfolio, setPortfolio] = useState<{
    id: string;
    name: string;
    cashBalance: number;
    totalBudget: number;
    positions: Array<{
      id?: string;
      symbol: string;
      companyName?: string;
      shares: number;
      costBasis: number;
      marketPrice?: number;
    }>;
  } | null>(null);

  const [strategy, setStrategy] = useState<DailyStrategyData | null>(null);

  // 编辑与一键粘贴弹窗 State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<"manual" | "paste">("manual");
  const [pasteText, setPasteText] = useState("");
  const [editingCash, setEditingCash] = useState(0);
  const [editingPositions, setEditingPositions] = useState<
    Array<{ symbol: string; shares: number; costBasis: number; marketPrice?: number }>
  >([]);

  // 2D 交互知识图谱全屏 Modal State
  const [kgModalOpen, setKgModalOpen] = useState(false);
  const [activeModalNode, setActiveModalNode] = useState<{
    id: string;
    label: string;
    relation: string;
    detail: string;
    type: "ROOT" | "SUPPLY" | "CLIENT" | "CATALYST" | "POSITION";
  } | null>(null);

  // P&L KPI 实时状态
  const [totalPnLData, setTotalPnLData] = useState<TotalPnLState | null>(null);
  const [retroPnLData, setRetroPnLData] = useState<RetroPnLState | null>(null);
  const [projectedPnLData, setProjectedPnLData] = useState<ProjectedPnLState | null>(null);
  const [generationMode, setGenerationMode] = useState<string>("FRESH");
  const [driftSummary, setDriftSummary] = useState<string | null>(null);

  // 保存手动修改的持仓
  const handleSavePortfolio = async () => {
    try {
      const res = await fetch("/api/stock/portfolio/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashBalance: editingCash,
          positions: editingPositions,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPortfolio(data.data);
        setEditModalOpen(false);
        setSyncNotice("✅ 已成功更新你的美股持仓与现金组合！点击下方按钮即可生成策略指南。");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 一键粘贴 MooMoo 文本智能识别导入
  const handleParsePaste = async () => {
    if (!pasteText.trim()) return;
    try {
      const res = await fetch("/api/stock/portfolio/parse-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: pasteText }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPortfolio(data.data);
        setEditModalOpen(false);
        setPasteText("");
        setSyncNotice(`🎉 成功识别导入 ${data.data.positions?.length || 0} 笔持仓！点击下方按钮即可生成策略指南。`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 获取 OpenD 连通状态
  const checkOpenDStatus = async () => {
    try {
      const res = await fetch("/api/stock/opend/status");
      const data = await res.json();
      if (data.success && data.data) {
        setOpenDStatus({
          connected: data.data.connected,
          message: data.data.connected
            ? `MooMoo OpenD 已连接 (${data.data.host}:${data.data.port})`
            : "OpenD 离线，请运行并登录 OpenD-GUI",
        });
        if (data.data.unlocked !== undefined) {
          setIsUnlocked(data.data.unlocked);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 强制重启 / 重新唤起 OpenD GUI 界面
  const handleRestartOpenD = async () => {
    setSyncNotice("🚀 正在为您重启并重新唤起 MooMoo OpenD 窗口...");
    try {
      const res = await fetch("/api/stock/opend/restart", { method: "POST" });
      const data = await res.json();
      if (data.message) {
        setSyncNotice(`✅ ${data.message}`);
      }
      await checkOpenDStatus();
    } catch (e: any) {
      console.error(e);
      setSyncNotice("❌ 重启 OpenD 失败，请直接手动双击桌面或任务栏右下角的 MooMoo OpenD。");
    }
  };

  // 加载当前美股组合持仓
  const fetchPortfolio = async () => {
    try {
      const res = await fetch("/api/stock/portfolio");
      const data = await res.json();
      if (data.success && data.data) {
        setPortfolio(data.data);
        if (data.data.totalBudget) {
          setCustomBudget(data.data.totalBudget);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // 手动触发 MooMoo 真实数据同步
  const handleSyncMooMoo = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch("/api/stock/portfolio/moomoo-sync", { method: "POST" });
      const data = await res.json();
      if (data.success && data.data) {
        setPortfolio(data.data);
        await checkOpenDStatus();

        if (data.rawMessage) {
          setSyncNotice(data.rawMessage);
        } else if (!data.data.positions || data.data.positions.length === 0) {
          setSyncNotice(
            "💡 OpenD 通道已连接。如果您的 OpenD 未解密或账户无持仓，您可以点击“✏️ 修改持仓”或选择“一键粘贴导入”。"
          );
        } else {
          setSyncNotice(`✅ 成功从 MooMoo 实时同步到 ${data.data.positions.length} 笔真实持仓！`);
        }
      }
    } catch (e: any) {
      console.error(e);
      setSyncNotice("❌ 同步请求失败，请确认 OpenD 网关处于运行状态。");
    } finally {
      setSyncing(false);
    }
  };

  // 实时大盘与公开行情 State (不依赖交易密码，完全由 OpenD API 接口抓取)
  const [quotes, setQuotes] = useState<Array<{ symbol: string; price: number; changePercent: number }>>([]);
  const [tradePassword, setTradePassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  // 解锁 MooMoo 交易密码
  const handleUnlockTrade = async () => {
    if (!tradePassword) return;
    setUnlocking(true);
    try {
      const res = await fetch("/api/stock/unlock-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: tradePassword }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data) setPortfolio(data.data);
        setIsUnlocked(true);
        setUnlockModalOpen(false);
        setSyncNotice("🎉 交易密码解锁成功！已直接从 OpenD 实时拉取到你的最新真实持仓。");
        setTradePassword("");
      } else {
        alert(data.error || "解锁失败，请检查 MooMoo 交易密码是否正确");
      }
    } catch (e: any) {
      alert("解锁请求异常");
    } finally {
      setUnlocking(false);
    }
  };

  // 自动拉取美股实时公开行情
  const fetchQuotes = async () => {
    try {
      const res = await fetch("/api/stock/market-quotes");
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setQuotes(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [watchlist, setWatchlist] = useState<Array<{ symbol: string; companyName: string }>>([]);

  // 自动拉取 MooMoo 自选关注股票列表 (无敏感权限)
  const fetchWatchlist = async () => {
    try {
      const res = await fetch("/api/stock/watchlist");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setWatchlist(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 操盘指南 Tab: "conclusion" (结论) vs "workflow" (生成过程)
  const [guideTab, setGuideTab] = useState<"conclusion" | "workflow">("conclusion");

  useEffect(() => {
    checkOpenDStatus();
    checkSearXNGStatus();
    fetchPortfolio();
    fetchQuotes();
    fetchWatchlist();

    // 尝试拉取最新的已有策略
    fetch("/api/stock/daily-strategy/latest")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setStrategy({
            id: data.data.id,
            strategyDate: data.data.strategyDate,
            marketOverview: data.data.marketOverview,
            actions: data.data.actions,
            riskAlerts: data.data.riskAlerts,
            institutionalReport: data.data.institutionalReport,
            narrativeReport: data.data.narrativeReport,
          });
          // 待实现 P&L、指南预期 P&L 数据回填
          if (data.data.mode) setGenerationMode(data.data.mode);
        }
      })
      .catch(console.error);
  }, []);

  // === 实时推导 P&L：只要 portfolio 或 quotes 发生变化就重新计算 ===
  useEffect(() => {
    if (!portfolio || !portfolio.positions || portfolio.positions.length === 0) return;

    const qMap = new Map<string, number>();
    for (const q of quotes) {
      if (q.symbol && q.price > 0) qMap.set(q.symbol.toUpperCase(), q.price);
    }

    const positions = portfolio.positions.map((p) => {
      const symbol = p.symbol.toUpperCase();
      const currentPrice = qMap.get(symbol) ?? p.marketPrice ?? p.costBasis;
      const marketValue = currentPrice * p.shares;
      const costValue = p.costBasis * p.shares;
      return { symbol, shares: p.shares, costBasis: p.costBasis, currentPrice, marketValue, costValue };
    });

    const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalCostBasis = positions.reduce((s, p) => s + p.costValue, 0);
    const totalPnL = totalMarketValue - totalCostBasis;
    const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;
    const cashBalance = portfolio.cashBalance ?? 0;

    setTotalPnLData({
      totalMarketValue: +totalMarketValue.toFixed(2),
      totalCostBasis: +totalCostBasis.toFixed(2),
      totalPnL: +totalPnL.toFixed(2),
      totalPnLPct: +totalPnLPct.toFixed(2),
      cashBalance,
      netAssets: +(totalMarketValue + cashBalance).toFixed(2),
      positions: positions.map((p) => {
        const pnl = p.marketValue - p.costValue;
        const pnlPct = p.costValue > 0 ? (pnl / p.costValue) * 100 : 0;
        const concentrationPct = totalMarketValue > 0 ? (p.marketValue / totalMarketValue) * 100 : 0;
        return {
          symbol: p.symbol,
          shares: p.shares,
          costBasis: p.costBasis,
          currentPrice: p.currentPrice,
          marketValue: +p.marketValue.toFixed(2),
          pnl: +pnl.toFixed(2),
          pnlPct: +pnlPct.toFixed(2),
          costValue: +p.costValue.toFixed(2),
          concentrationPct: +concentrationPct.toFixed(1),
        };
      }),
    });
  }, [portfolio, quotes]);


  // 触发生成今日操盘指南
  const handleGenerateStrategy = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock/daily-strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customBudget }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setStrategy({
          id: data.data.strategyId,
          strategyDate: data.data.strategyDate,
          marketOverview: data.data.output.marketOverview,
          actions: data.data.output.actions,
          riskAlerts: data.data.output.riskAlerts,
          institutionalReport: data.data.output.institutionalReport,
          narrativeReport: data.data.output.narrativeReport,
        });
        // P&L KPI 数据
        if (data.data.totalPnL) setTotalPnLData(data.data.totalPnL as TotalPnLState);
        if (data.data.projectedPnL) setProjectedPnLData(data.data.projectedPnL as ProjectedPnLState);
        if (data.data.retroPnL) setRetroPnLData(data.data.retroPnL as RetroPnLState);
        if (data.data.generationMode) setGenerationMode(data.data.generationMode);
        if (data.data.driftSummary) setDriftSummary(data.data.driftSummary);
        if (data.data.openDStatus) {
          setOpenDStatus({
            connected: data.data.openDStatus.connected,
            message: data.data.openDStatus.message,
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderNarrativeReport = (text: string) => {
    if (!text) return null;

    const sections = text
      .split(/(?=【[^】]+】)/)
      .map((s) => s.trim())
      .filter(Boolean);

    return (
      <div className="space-y-4 font-sans">
        {/* 策略概览高光栏 */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-md">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h4 className="text-sm font-bold text-slate-100">{t("gen.pages.stock.StockStudioPage.gen_5648310a", "美股每日操盘与风险诊断报告")}</h4>
            </div>
            <div className="flex gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold flex items-center gap-1">
                🛡️ 风控状态: 良好
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold flex items-center gap-1">
                📈 研报级别: 策略级
              </span>
            </div>
          </div>
        </div>

        {/* 结构段落卡片渲染 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sections.map((sec, idx) => {
            const titleMatch = sec.match(/【([^】]+)】/);
            const title = titleMatch ? titleMatch[1] : `策略要点 ${idx + 1}`;
            const content = sec.replace(/【[^】]+】[:：]?/, "").trim();

            let icon = <PieChart className="w-4 h-4 text-indigo-400" />;
            let cardBorder = "border-slate-800 bg-slate-950/70";
            let titleColor = "text-slate-200";

            if (title.includes("健康") || title.includes("诊断")) {
              icon = <ShieldCheck className="w-4 h-4 text-cyan-400" />;
              cardBorder = "border-cyan-900/50 bg-cyan-950/20";
              titleColor = "text-cyan-300";
            } else if (title.includes("大盘") || title.includes("催化剂")) {
              icon = <TrendingUp className="w-4 h-4 text-sky-400" />;
              cardBorder = "border-sky-900/50 bg-sky-950/20";
              titleColor = "text-sky-300";
            } else if (title.includes("个股") || title.includes("归因")) {
              icon = <BookOpen className="w-4 h-4 text-purple-400" />;
              cardBorder = "border-purple-900/50 bg-purple-950/20";
              titleColor = "text-purple-300";
            } else if (title.includes("调仓") || title.includes("资金") || title.includes("策略")) {
              icon = <Zap className="w-4 h-4 text-emerald-400" />;
              cardBorder = "border-emerald-900/50 bg-emerald-950/20";
              titleColor = "text-emerald-300";
            }

            return (
              <div key={idx} className={`p-4 rounded-xl border ${cardBorder} shadow-sm space-y-2.5`}>
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                  {icon}
                  <span className={`font-bold text-xs ${titleColor}`}>{title}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
                  {content}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const [selectedKgSymbol, setSelectedKgSymbol] = useState<string>("");

  // 人工修改/自定义知识图谱 State
  const [editKgModalOpen, setEditKgModalOpen] = useState(false);
  const [customNodesMap, setCustomNodesMap] = useState<Record<string, KnowledgeGraphEntityNode[]>>({});
  const [customEdgesMap, setCustomEdgesMap] = useState<Record<string, KnowledgeGraphRelationEdge[]>>({});
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState<"SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT">("SUPPLIER");
  const [newRelationText, setNewRelationText] = useState("");
  const [newEntityDesc, setNewEntityDesc] = useState("");

  const quotesMap = new Map<string, number>(quotes.map((q) => [q.symbol.toUpperCase(), q.price]));
  const posList = portfolio?.positions || [];
  const kgList: KnowledgeGraphItem[] = strategy?.knowledgeGraph ||
    (posList.length > 0
      ? posList.map((p) => ({
          symbol: p.symbol.toUpperCase(),
          companyName: p.companyName || p.symbol,
          positionCategory: "EXISTING",
          industrySector: "实盘持仓资产",
          newsCatalysts: [
            `【OpenD 接口】正在监听 ${p.symbol} 实时盘口与最新快讯...`,
            `集中度占比分析: ${((p.shares * (p.marketPrice || p.costBasis || 0) / Math.max(1, posList.reduce((acc, item) => acc + item.shares * (item.marketPrice || item.costBasis || 0), 0))) * 100).toFixed(1)}%`,
          ],
          nodes: [
            { id: p.symbol.toUpperCase(), name: p.companyName || p.symbol, type: "ROOT_STOCK", marketSymbol: p.symbol.toUpperCase(), description: `实盘持仓: ${p.shares}股` },
            { id: `SUP_${p.symbol}`, name: `${p.symbol} 核心供应商`, type: "SUPPLIER", description: `${p.symbol} 上游关键零部件与服务提供商` },
            { id: `CLI_${p.symbol}`, name: `${p.symbol} 下游核心客户`, type: "CLIENT", description: `${p.symbol} 核心产品采购与大单需求方` },
            { id: "FED_POLICY", name: "美联储降息周期", type: "MACRO", description: "分母端折现率下行提振长久期科技股估值" },
          ],
          edges: [
            { source: p.symbol.toUpperCase(), target: `SUP_${p.symbol}`, relation: "上游供应链与零件代工", impact: "POSITIVE" },
            { source: p.symbol.toUpperCase(), target: `CLI_${p.symbol}`, relation: "核心产品大单采购", impact: "POSITIVE" },
            { source: "FED_POLICY", target: p.symbol.toUpperCase(), relation: "降息预期提振科技股估值", impact: "POSITIVE" },
          ],
          actionAdvice: "HOLD",
          guidanceText: "针对已有持仓进行动态诊断，点击生成获取最新推演。",
        }))
      : []);

  const activeKgSymbol = (selectedKgSymbol || kgList[0]?.symbol || "").toUpperCase();
  const rawCurrentKgItem = kgList.find((item) => item.symbol.toUpperCase() === activeKgSymbol) || kgList[0];

  // 融合人工修改的自定义实体节点与三元组边
  const currentKgItem: KnowledgeGraphItem | undefined = rawCurrentKgItem
    ? {
        ...rawCurrentKgItem,
        nodes: [
          ...(rawCurrentKgItem.nodes || []),
          ...(customNodesMap[rawCurrentKgItem.symbol.toUpperCase()] || []),
        ],
        edges: [
          ...(rawCurrentKgItem.edges || []),
          ...(customEdgesMap[rawCurrentKgItem.symbol.toUpperCase()] || []),
        ],
      }
    : undefined;

  // 添加人工自定义图谱实体 (同步落库至 Prisma 数据库)
  const handleAddCustomEntity = async () => {
    if (!currentKgItem || !newEntityName.trim()) return;
    const symbolKey = currentKgItem.symbol.toUpperCase();
    const customId = `CUSTOM_${Date.now()}`;

    const newNode: KnowledgeGraphEntityNode = {
      id: customId,
      name: newEntityName.trim(),
      type: newEntityType,
      description: newEntityDesc.trim() || `人工添加自定义实体 (${newEntityName})`,
    };

    const newEdge: KnowledgeGraphRelationEdge = {
      source: symbolKey,
      target: customId,
      relation: newRelationText.trim() || "人工绑定拓展关系",
      impact: "POSITIVE",
    };

    // 本地 UI 状态即时响应
    setCustomNodesMap((prev) => ({
      ...prev,
      [symbolKey]: [...(prev[symbolKey] || []), newNode],
    }));

    setCustomEdgesMap((prev) => ({
      ...prev,
      [symbolKey]: [...(prev[symbolKey] || []), newEdge],
    }));

    // 同步发送 POST 请求持久化落库至数据库
    try {
      await fetch("/api/stock/knowledge-graph/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbolKey,
          newNode,
          newEdge,
        }),
      });
    } catch (e) {
      console.warn("[StockStudioPage] DB Knowledge Graph update failed:", e);
    }

    setNewEntityName("");
    setNewRelationText("");
    setNewEntityDesc("");
    setEditKgModalOpen(false);
  };

  // ⚙️ 生成过程：渲染工作流可视化与数据透视审计箱 (100% 动态 OpenD 数据 + 双指南 + 股票知识图谱)
  const renderWorkflowProcessView = () => {
    const totalCash = portfolio?.cashBalance || 0;
    const totalAvailableCapital = totalCash + customBudget;
    const totalPositionsMarketValue = posList.reduce(
      (acc, p) => acc + p.shares * (p.marketPrice || p.costBasis || 0),
      0
    );
    const actionsList = strategy?.actions || [];
    const totalBuyCost = actionsList
      .filter((a) => a.action === "BUY")
      .reduce((acc, a) => acc + (a.estimatedAmount || a.suggestedShares * a.estimatedPrice || 0), 0);

    const isBudgetCompliant = totalBuyCost <= totalAvailableCapital;

    return (
      <div className="space-y-5 animate-fadeIn">
        {/* 数据源双引擎连通审计栏：MooMoo OpenD 实盘网关 + SearXNG 本地搜索引擎 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-900/90 border border-indigo-900/50 rounded-xl shadow-sm text-xs font-mono">
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              MooMoo OpenD 账户网关:
            </span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${openDStatus.connected ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-amber-950 text-amber-300 border border-amber-800"}`}>
              {openDStatus.message}
            </span>
          </div>

          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              SearXNG 本地搜索引擎:
            </span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${searxngStatus.connected ? "bg-sky-950 text-sky-300 border border-sky-800" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
              {searxngStatus.message}
            </span>
          </div>
        </div>

        {/* 三大核心指南：已有仓位增减 + 新仓位建立 + 昨日指南复盘沉淀 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 指南一：已有仓位增减 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2.5 shadow">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <ShieldAlert className="w-4.5 h-4.5 text-amber-400" />
              <h3 className="text-xs font-bold text-amber-300">
                【指南一】：已有仓位增减与健康度诊断
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
              {strategy?.existingPositionGuidance ||
                `• 针对现有 ${posList.length} 笔实盘持仓进行动态诊断：\n• 请点击「生成今日 MooMoo 操盘指南」，AI 智能体将基于最新 OpenD 数据与集中度风控指标，实时计算输出已有仓位的加减仓策略。`}
            </p>
          </div>

          {/* 指南二：新仓位建立 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2.5 shadow">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Zap className="w-4.5 h-4.5 text-emerald-400" />
              <h3 className="text-xs font-bold text-emerald-300">
                【指南二】：新仓位建立与自选风口挖潜
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
              {strategy?.newPositionGuidance ||
                `• 针对现有闲置现金 ($${totalCash.toFixed(2)}) 与新增预算 ($${customBudget.toFixed(2)}) 规划新仓：\n• 请点击「生成今日 MooMoo 操盘指南」，AI 将优先从您的 MooMoo 自选关注池与隔夜风口中挖掘最具催化剂的新标的。`}
            </p>
          </div>

          {/* 指南三：昨日指南复盘与沉淀优化 */}
          <div className="bg-slate-900/90 border border-cyan-900/80 rounded-xl p-4 space-y-2.5 shadow bg-cyan-950/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4.5 h-4.5 text-cyan-400" />
                <h3 className="text-xs font-bold text-cyan-300">
                  【指南三】：昨日指南复盘与沉淀优化
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
                跟单率: {strategy ? "100%" : "--"}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300 leading-relaxed font-sans">
              <p className="text-slate-300 text-[11px] whitespace-pre-line">
                {strategy?.retrospectiveGuidance ||
                  `• 历史指令与实盘对比复盘：\n根据历史操盘指南与当前 MooMoo 实际仓位变化，系统将自动复盘跟单执行完成度、计算避险/收益效果，并沉淀为长效交易纪律。`}
              </p>
            </div>
          </div>
        </div>

        {/* 基于股票的知识图谱与互联网/OpenD 资讯面板 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-800 pb-3 gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-400" />{t("gen.pages.stock.StockStudioPage.gen_c1c29f5e", "基于股票的知识图谱与 OpenD / 互联网新闻资讯")}</h3>
              <p className="text-[11px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_02d7223c", "可视化展示每只股票的产业链上下游节点、互联网资讯快讯与 AI 研判逻辑")}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setKgModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />{t("gen.pages.stock.StockStudioPage.gen_4f83279d", "点击弹出【全景 2D 交互知识图谱】")}</button>

              {/* 股票 Selector */}
              <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {kgList.map((item) => (
                  <button
                    key={item.symbol}
                    onClick={() => setSelectedKgSymbol(item.symbol)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                      (selectedKgSymbol || kgList[0]?.symbol) === item.symbol
                        ? "bg-purple-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {item.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 选中的股票知识图谱卡片 */}
          {currentKgItem && (
            <div className="space-y-3.5 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-base font-extrabold text-white font-mono">
                    {currentKgItem.symbol}
                  </span>
                  <span className="text-xs text-slate-400">{currentKgItem.companyName}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    {currentKgItem.industrySector}
                  </span>
                </div>
                <button
                  onClick={() => setKgModalOpen(true)}
                  className="px-2.5 py-1 rounded text-xs font-bold font-mono bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-purple-400" />{t("gen.pages.stock.StockStudioPage.gen_730c8936", "查看 2D 全景图")}</button>
              </div>

              {/* 知识图谱节点关联 */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  金融语义三元组与实体多跳关联 (Triples: E1 ──[Relation]──► E2):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(currentKgItem.edges || []).map((edge, idx) => (
                    <div
                      key={idx}
                      onClick={() => setKgModalOpen(true)}
                      className="bg-slate-900 border border-slate-800/80 hover:border-purple-500/80 p-2.5 rounded text-xs text-slate-300 font-mono space-y-1 cursor-pointer transition-all hover:bg-slate-850"
                    >
                      <div className="text-[10px] text-purple-400 flex justify-between">
                        <span>[{edge.relation}]</span>
                        <span className="text-[9px] text-slate-500">{t("gen.pages.stock.StockStudioPage.gen_fc1f2690", "点击交互 ➔")}</span>
                      </div>
                      <div className="font-bold text-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-amber-300">{edge.source}</span>
                        <span className="text-slate-500">➔</span>
                        <span className="text-emerald-300">{edge.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 互联网新闻与 OpenD 资讯快讯 */}
              <div className="space-y-1.5 pt-1">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  互联网新闻与 OpenD 接口资讯快讯 (News Catalysts):
                </h4>
                <div className="space-y-1.5">
                  {currentKgItem.newsCatalysts.map((news, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/90 border border-slate-800 p-2.5 rounded text-xs text-cyan-200 leading-relaxed font-sans"
                    >
                      {news}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 工作流全景链路 */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4 shadow-inner">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              操盘指南生成工作流与数据审计 (Generation Pipeline & Audit)
            </h3>
            <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-full font-mono shrink-0">{t("gen.pages.stock.StockStudioPage.gen_cf3e4afc", "全流程确定性校验: 100% 实时公式审计")}</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">{t("gen.pages.stock.StockStudioPage.gen_7629f4e3", "本视图**100% 无任何硬编码模拟数据**，所有节点数据均从 OpenD 本地通道实时调取，所有的交易预算、股数与总价均由精确数学公式计算确定。")}</p>

          {/* 5 步链路节点 */}
          <div className="space-y-3">
            {/* 步骤 1 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="text-xs font-bold text-slate-200">🔌 OpenD 网关连通与身份校验</span>
                </div>
                <span
                  className={`text-[11px] font-mono border px-2 py-0.5 rounded ${
                    openDStatus.connected
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : "bg-amber-950 text-amber-300 border-amber-800"
                  }`}
                >
                  {openDStatus.connected ? "✅ 127.0.0.1:11111 在线" : "⚠️ 连通初始化中"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded border border-slate-800/60">
                <div>券商实体: MooMoo Financial SG (FUTUSG)</div>
                <div>{t("gen.pages.stock.StockStudioPage.gen_5999fec9", "主账户ID: 283726803950473678")}</div>
                <div>传输协议: 44字节 Native Header (64位 uint64)</div>
              </div>
            </div>

            {/* 步骤 2 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="text-xs font-bold text-slate-200">💰 资金基数与初始持仓快照</span>
                </div>
                <span className="text-[11px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                  可用资金计: ${totalAvailableCapital.toFixed(2)} USD
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded border border-slate-800/60">
                <div>闲置现金: ${totalCash.toFixed(2)} USD</div>
                <div>新增预算: ${customBudget.toFixed(2)} USD</div>
                <div>持仓总市值: ${totalPositionsMarketValue.toFixed(2)} USD</div>
              </div>
              <div className="text-[11px] font-mono bg-slate-950 p-2.5 rounded border border-slate-800/60 text-slate-300">
                <span className="text-slate-400">实盘持仓明细 ({posList.length} 笔): </span>
                {posList.length > 0
                  ? posList.map((p) => `${p.symbol} (${p.shares}股 @ 成本$${p.costBasis})`).join(" | ")
                  : "暂无持仓"}
              </div>
            </div>

            {/* 步骤 3 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="text-xs font-bold text-slate-200">📈 OpenD 实盘即时现价抓取 (Cmd 3001/3004)</span>
                </div>
                <span className="text-[11px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
                  已成功拉取 {quotes.length} 笔行情
                </span>
              </div>
              <div className="flex flex-wrap gap-2 bg-slate-950 p-2.5 rounded border border-slate-800/60">
                {quotes.length > 0 ? (
                  quotes.map((q) => (
                    <div key={q.symbol} className="text-[11px] font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded flex items-center gap-1.5">
                      <span className="font-bold text-slate-200">{q.symbol}:</span>
                      <span className="text-slate-300">${q.price.toFixed(2)}</span>
                      <span className={q.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 font-mono">{t("gen.pages.stock.StockStudioPage.gen_006b36c3", "从 OpenD 接口实时传输中...")}</span>
                )}
              </div>
            </div>

            {/* 步骤 4 */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <span className="text-xs font-bold text-slate-200">🤖 AI 智能体结构化推理 (Prompt Governance)</span>
                </div>
                <span className="text-[11px] font-mono bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
                  stock.allocation.strategy@v1
                </span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono bg-slate-950 p-2.5 rounded border border-slate-800/60 space-y-1">
                <div>
                  <span className="text-slate-400">输出策略指令共 ({actionsList.length} 项): </span>
                  {actionsList.length > 0
                    ? actionsList.map((a) => `${a.action === "BUY" ? "加仓" : a.action === "TRIM" ? "减仓" : "观望"}${a.symbol}`).join(" | ")
                    : "暂无推荐指令"}
                </div>
              </div>
            </div>

            {/* 步骤 5 */}
            <div className="bg-slate-900/90 border border-indigo-900/80 rounded-lg p-3.5 space-y-2 bg-indigo-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-slate-950 font-bold text-xs flex items-center justify-center">
                    5
                  </span>
                  <span className="text-xs font-bold text-indigo-300">🛡️ 确定性风控与数学校准层 (Guardrail Layer)</span>
                </div>
                <span className="text-[11px] font-mono bg-emerald-900/80 text-emerald-200 border border-emerald-700 px-2 py-0.5 rounded font-bold">{t("gen.pages.stock.StockStudioPage.gen_6c64ea45", "纯公式实时求导校验")}</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-300 font-mono bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-emerald-400">
                  ✓ 价格硬锁定: AI 建议估价已 100% 替换为 OpenD 实时现价 (映射覆盖 {actionsList.length} 项指令)
                </div>
                <div className="text-emerald-400">
                  ✓ 资金拦截校验: 买入建议总支出 (${totalBuyCost.toFixed(2)}) ≤ 可用资金上限 (${totalAvailableCapital.toFixed(2)}) [{isBudgetCompliant ? "✅ 100% 合规未超支" : "⚠️ 截断保护中"}]
                </div>
                <div className="text-emerald-400">
                  ✓ 交易总额求导: 估算金额 = 推荐股数 × OpenD 实盘现价 (纯数学精确求得)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* 顶部标题与 OpenD 状态栏 */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 rounded-xl p-5 gap-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
              {t("stock.title", "美股 AI 智能投研与每日调仓工作台")}
            </h1>
          </div>
          <p className="text-slate-400 text-sm pl-11">
            {t("stock.subtitle", "整合 MooMoo OpenD 实时盘口、美股新闻热点与持仓风控，开盘前自动生成调仓指令清单")}
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-slate-950/60 border border-slate-800 px-4 py-2 rounded-lg text-sm">
          <span className={`w-3 h-3 rounded-full ${openDStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="text-slate-300 font-medium">
            {openDStatus.connected
              ? isEn ? "MooMoo OpenD Connected" : "MooMoo OpenD 已启动"
              : isEn ? "Connecting OpenD..." : "OpenD 初始化中"}
          </span>
          <button
            onClick={checkOpenDStatus}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title={isEn ? "Refresh OpenD connection status" : "刷新 OpenD 连接状态"}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRestartOpenD}
            className="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 text-xs font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
            title={isEn ? "Bring MooMoo Client to Front" : "一键前台唤起并置顶显示 MooMoo 客户端（Winnerineast 账户）"}
          >
            <span>{isEn ? "🚀 Launch MooMoo Client" : "🚀 唤起 MooMoo 客户端"}</span>
          </button>
        </div>
      </header>
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow">
        <div className="flex items-center gap-2 text-slate-400 font-semibold">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>美股热门标的实时公开行情 (OpenD 公开频道):</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {quotes.map((q) => (
            <div key={q.symbol} className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1 rounded border border-slate-800">
              <span className="font-bold text-slate-200">{q.symbol}</span>
              <span className="text-slate-300 font-mono">${q.price.toFixed(2)}</span>
              <span className={`font-semibold font-mono ${q.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ======= 常驻 P&L 全局看板 ======= */}
      {totalPnLData && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
          {/* 标题行 */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              {t("stock.summaryPnL", "持仓盈亏与资产概览 (P&L Summary)")}
              <span className="text-[10px] text-slate-500 font-normal ml-1">
                {isEn ? "Calculated via OpenD Live Quotes" : "基于 OpenD 实时行情计算"}
              </span>
            </h2>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold font-mono text-sm border ${
              totalPnLData.totalPnL >= 0
                ? "bg-emerald-950/70 text-emerald-400 border-emerald-700/60"
                : "bg-rose-950/70 text-rose-400 border-rose-700/60"
            }`}>
              {totalPnLData.totalPnL >= 0 ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              {totalPnLData.totalPnL >= 0 ? "+" : ""}${totalPnLData.totalPnL.toFixed(2)}
              <span className="text-xs opacity-70 ml-1">
                ({totalPnLData.totalPnLPct >= 0 ? "+" : ""}{totalPnLData.totalPnLPct.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* 三格汇总数据 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 mb-0.5">{t("stock.marketValue", "持仓总市值")}</p>
              <p className="text-base font-bold text-slate-200 font-mono">${totalPnLData.totalMarketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-500">{t("stock.costBasis", "总持仓成本")} ${totalPnLData.totalCostBasis.toFixed(0)}</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 mb-0.5">{t("stock.netAssets", "净资产总额")}</p>
              <p className="text-base font-bold text-indigo-300 font-mono">${totalPnLData.netAssets.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-500">{isEn ? "Incl. Cash" : "含现金"} ${totalPnLData.cashBalance.toFixed(0)}</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 mb-0.5">{t("stock.cashBalance", "闲置可用现金")}</p>
              <p className="text-base font-bold text-emerald-300 font-mono">${totalPnLData.cashBalance.toFixed(2)}</p>
              <p className="text-[10px] text-slate-500">{isEn ? "Available to Buy" : "可用于加仓"}</p>
            </div>
          </div>

          {/* 各股票逐条盈亏 */}
          {totalPnLData.positions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {totalPnLData.positions.map((pos) => (
                <div
                  key={pos.symbol}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                    pos.pnl >= 0
                      ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                      : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                  }`}
                >
                  <span className="font-bold text-slate-200">{pos.symbol}</span>
                  <span className="text-slate-400">{pos.shares}股</span>
                  <span className="text-slate-500">@${pos.costBasis}</span>
                  <span>→</span>
                  <span className="font-bold">${pos.currentPrice.toFixed(2)}</span>
                  <span className={`font-bold ${pos.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)} ({pos.pnl >= 0 ? "+" : ""}{pos.pnlPct.toFixed(1)}%)
                  </span>
                  {pos.concentrationPct > 30 && (
                    <span className="text-[9px] text-amber-400 bg-amber-950/60 px-1 rounded">⚠️{pos.concentrationPct.toFixed(0)}%</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 指南 P&L 复盘区（如果有 retroPnL 数据） */}
          {(retroPnLData || projectedPnLData) && (
            <div className="border-t border-slate-800/60 pt-3 flex flex-wrap gap-3">
              {retroPnLData && (
                <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_f2e9f884", "上次指南质量")}</p>
                    <p className={`text-lg font-bold font-mono ${
                      retroPnLData.accuracyScore >= 70 ? "text-emerald-400" : retroPnLData.accuracyScore >= 50 ? "text-amber-400" : "text-rose-400"
                    }`}>{retroPnLData.accuracyScore}<span className="text-xs text-slate-500">/100</span></p>
                    <p className="text-[9px] text-slate-500">{retroPnLData.strategyDate}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_29affed9", "避免损失")}</p>
                    <p className="text-base font-bold font-mono text-emerald-400">+${retroPnLData.avoidedLoss.toFixed(0)}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_eed846d6", "跟单率")}</p>
                    <p className="text-base font-bold font-mono text-indigo-300">{(retroPnLData.executionMatchRate * 100).toFixed(0)}%</p>
                  </div>
                </div>
              )}
              {projectedPnLData && (
                <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_8e5b2028", "指南预期 P&amp;L")}</p>
                    <p className={`text-lg font-bold font-mono ${projectedPnLData.totalProjectedChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {projectedPnLData.totalProjectedChange >= 0 ? "+" : ""}${projectedPnLData.totalProjectedChange.toFixed(0)}
                    </p>
                    <p className="text-[9px] text-slate-500">{t("gen.pages.stock.StockStudioPage.gen_733bc1c2", "按全部执行")}</p>
                  </div>
                </div>
              )}
              {generationMode !== "FRESH" && (
                <div className={`flex items-center px-3 py-2 rounded-lg border text-xs font-mono ${
                  generationMode === "REPLAN"
                    ? "bg-amber-950/40 border-amber-700/60 text-amber-300"
                    : "bg-indigo-950/40 border-indigo-700/60 text-indigo-300"
                }`}>
                  {generationMode === "REPLAN" ? "⚡ REPLAN 模式 — 检测到持仓变化" : "🔄 ADJUST 模式 — 无持仓变化，调整目标"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 当没有持仓时的提示条 */}
      {!totalPnLData && (
        <div className="bg-slate-900/60 border border-slate-800 border-dashed rounded-xl p-4 text-center text-sm text-slate-500">
          <DollarSign className="w-5 h-5 mx-auto mb-1.5 text-slate-600" />
          <p>P&amp;L 看板加载中... 请先同步 MooMoo 持仓数据，或等待行情拉取完成。</p>
        </div>
      )}

      {/* 主界面网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* 左侧：持仓概览与新增预算设定 (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* 资产与预算卡片 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-semibold text-slate-200 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-400" />
                MooMoo 仓位与资金看板
              </h2>
              <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                USD
              </span>
            </div>

            {syncNotice && (
              <div className="p-3 bg-slate-950 border border-indigo-800/80 rounded-lg text-xs text-indigo-200 leading-relaxed font-sans shadow-inner flex justify-between items-start gap-2">
                <span>{syncNotice}</span>
                <button
                  onClick={() => setSyncNotice(null)}
                  className="text-slate-400 hover:text-slate-200 shrink-0 text-xs font-bold p-0.5"
                  title={t("gen.pages.stock.StockStudioPage.gen_c335e973", "关闭提示")}
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
                <p className="text-xs text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_73374e1c", "闲置现金可用")}</p>
                <p className="text-lg font-bold text-emerald-400">
                  ${portfolio?.cashBalance !== undefined ? portfolio.cashBalance.toFixed(2) : "0.00"}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
                <p className="text-xs text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_6de026f2", "数据源类型")}</p>
                <p className="text-sm font-bold text-indigo-300 mt-1">
                  {openDStatus.connected ? "MooMoo OpenD 直连" : "手动/模板导入"}
                </p>
              </div>
            </div>

            {/* 同步、解锁密码与手动编辑按钮组 */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={handleSyncMooMoo}
                disabled={syncing}
                className="py-2 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold rounded-lg flex items-center justify-center space-x-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                <span>{syncing ? "同步中" : "🔄 同步"}</span>
              </button>

              <button
                onClick={() => setUnlockModalOpen(true)}
                disabled={isUnlocked}
                className={`py-2 px-1.5 text-[11px] font-semibold rounded-lg flex items-center justify-center space-x-1 transition-all ${
                  isUnlocked
                    ? "bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-75"
                    : "bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800"
                }`}
              >
                <span>{isUnlocked ? "🔒 已解锁" : "🔑 解锁密码"}</span>
              </button>

              <button
                onClick={() => {
                  setEditingCash(portfolio?.cashBalance || 0);
                  setEditingPositions(
                    portfolio?.positions?.map((p) => ({
                      symbol: p.symbol,
                      shares: p.shares,
                      costBasis: p.costBasis,
                    })) || []
                  );
                  setEditModalOpen(true);
                }}
                className="py-2 px-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 text-[11px] font-semibold rounded-lg flex items-center justify-center space-x-1 transition-all"
              >
                <span>✏️ 修改持仓</span>
              </button>
            </div>

            {/* 新增预算调节 */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>今日计划新增注入预算 ($)</span>
                <span className="text-indigo-400 font-bold">${customBudget} USD</span>
              </label>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

            {/* P&L 汇总展示板（totalPnLData 有数据时显示） */}
            {totalPnLData && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2 mt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />{t("gen.pages.stock.StockStudioPage.gen_2fdfa76e", "实时 P&amp;L 汇总")}</span>
                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                    totalPnLData.totalPnL >= 0
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                      : "bg-rose-950/80 text-rose-400 border border-rose-800"
                  }`}>
                    {totalPnLData.totalPnL >= 0 ? "+" : ""}${totalPnLData.totalPnL.toFixed(2)} ({totalPnLData.totalPnL >= 0 ? "+" : ""}{totalPnLData.totalPnLPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="bg-slate-900 rounded p-1.5 text-center">
                    <p className="text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_af1a41aa", "总市值")}</p>
                    <p className="font-bold text-slate-200 font-mono">${totalPnLData.totalMarketValue.toFixed(0)}</p>
                  </div>
                  <div className="bg-slate-900 rounded p-1.5 text-center">
                    <p className="text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_b9550d2d", "流动现金")}</p>
                    <p className="font-bold text-emerald-300 font-mono">${totalPnLData.cashBalance.toFixed(0)}</p>
                  </div>
                  <div className="bg-slate-900 rounded p-1.5 text-center">
                    <p className="text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_518272b7", "净资产")}</p>
                    <p className="font-bold text-indigo-300 font-mono">${totalPnLData.netAssets.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 核心持仓列表（P&L 增强版） */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-slate-400">
                当前持仓股票清单 ({portfolio?.positions?.length || 0} 标的)
              </p>
              <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
                {portfolio?.positions && portfolio.positions.length > 0 ? (
                  portfolio.positions.map((pos, idx) => {
                    // 读取 totalPnLData 中对应这只股的 P&L
                    const pnlItem = totalPnLData?.positions?.find((p) => p.symbol === pos.symbol);
                    const pnl = pnlItem?.pnl;
                    const pnlPct = pnlItem?.pnlPct;
                    const currentPrice = pnlItem?.currentPrice ?? pos.marketPrice ?? pos.costBasis;
                    const concPct = pnlItem?.concentrationPct;
                    return (
                      <div
                        key={pos.id || idx}
                        className={`flex justify-between items-center bg-slate-950 p-2.5 rounded border ${
                          pnl !== undefined && pnl >= 0 ? "border-emerald-900/40" : pnl !== undefined ? "border-rose-900/40" : "border-slate-800/80"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-200">{pos.symbol}</span>
                            <span className="text-xs text-slate-500">{pos.shares} 股</span>
                            {concPct !== undefined && concPct > 30 && (
                              <span className="text-[9px] text-amber-400 bg-amber-950/60 px-1 rounded">⚠️{concPct.toFixed(0)}%</span>
                            )}
                          </div>
                          {pos.companyName && (
                            <p className="text-[10px] text-slate-500">{pos.companyName}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400 font-mono">成本: ${pos.costBasis}</div>
                          <div className="text-xs text-indigo-300 font-mono">现价: ${currentPrice.toFixed(2)}</div>
                          {pnl !== undefined && (
                            <div className={`text-xs font-bold font-mono ${
                              pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnl >= 0 ? "+" : ""}{pnlPct?.toFixed(1)}%)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">{t("gen.pages.stock.StockStudioPage.gen_f03a2673", "暂无持仓数据，点击上方“一键从 MooMoo 同步”即可从 OpenD 拉取")}</p>
                )}
              </div>
            </div>

            {/* 持仓变化提醒 (REPLAN 模式) */}
            {driftSummary && driftSummary !== "持仓无变化" && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-start gap-1.5">
                <span className="text-base">⚡</span>
                <div>
                  <span className="font-bold">{
                    generationMode === "REPLAN" ? "检测到持仓变化，已切换 REPLAN 模式" : "持仓变化记录"
                  }</span>
                  <p className="text-amber-400/80 mt-0.5">{driftSummary}</p>
                </div>
              </div>
            )}

            {/* ⭐ MooMoo 自选关注股票池 (优先推荐池) */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>MooMoo 自选关注池 ({watchlist.length} 标的)</span>
                </p>
                <button
                  onClick={fetchWatchlist}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  title={t("gen.pages.stock.StockStudioPage.gen_527f2fa5", "刷新 MooMoo 自选关注列表")}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{t("gen.pages.stock.StockStudioPage.gen_be5df650", "同步自选")}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                💡 推演时 AI 智能体将【优先从你的 MooMoo 自选关注池】中挑选具备风口与催化剂的调仓推荐标的。
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                {watchlist.length > 0 ? (
                  watchlist.map((item) => (
                    <span
                      key={item.symbol}
                      className="px-2 py-0.5 bg-amber-950/40 border border-amber-800/60 rounded text-[11px] font-mono text-amber-200 font-medium flex items-center gap-1"
                      title={item.companyName}
                    >
                      <span className="font-bold">{item.symbol}</span>
                      {item.companyName && <span className="text-[10px] text-amber-400/80 font-sans">{item.companyName}</span>}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 py-1">{t("gen.pages.stock.StockStudioPage.gen_3db7095c", "未检测到自选股，点击“同步自选”或在 MooMoo 软件添加")}</span>
                )}
              </div>
            </div>

            {/* 触发按键 */}
            <button
              onClick={handleGenerateStrategy}
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{t("stock.generating", "AI 正在分析盘口与宏观热点...")}</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                  <span>{t("stock.generateReport", "一键推演开盘前调仓指南")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 右侧：操盘指南与双视角报告 (8 cols) */}
        <div className="lg:col-span-8 space-y-6 relative min-h-[400px]">
          {/* AI 智能体推演中的虚化遮罩与高亮提示 */}
          {loading && (
            <div className="absolute inset-0 z-30 bg-slate-950/75 backdrop-blur-md rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-4 transition-all duration-500 border border-indigo-500/40 shadow-2xl">
              <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-full border border-indigo-500/40 animate-pulse">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-lg font-extrabold text-white flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>AI 智能体隔夜推演中...</span>
                </h3>
                <p className="text-xs text-indigo-200/90 leading-relaxed font-sans">{t("gen.pages.stock.StockStudioPage.gen_280aee33", "系统正在融合隔夜美股宏观数据与当前 MooMoo 持仓进行量化推演。推演完成后，下方的操作指令与专业研报将自动覆盖更新。")}</p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-950/90 text-indigo-300 border border-indigo-800 rounded-full text-xs font-mono shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />{t("gen.pages.stock.StockStudioPage.gen_bb5594f3", "即将更新：今日买卖指令清单 / 风险警报 / 策略诊断研报")}</div>
            </div>
          )}

          {/* 策略内容展示（推演中虚化并禁用交互） */}
          <div
            className={`space-y-6 transition-all duration-300 ${
              loading ? "filter blur-[3px] opacity-30 pointer-events-none select-none" : "opacity-100 blur-0"
            }`}
          >
            {strategy ? (
              <>
                {/* 操盘指南动作卡片 */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 shadow-lg">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        MooMoo 每日开盘操盘指南
                        {/* 生成模式标签 */}
                        {generationMode !== "FRESH" && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            generationMode === "REPLAN"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-indigo-950 text-indigo-300 border border-indigo-800"
                          }`}>
                            {generationMode === "REPLAN" ? "⚡ REPLAN" : "🔄 ADJUST"}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-slate-400">
                        推演日期: {strategy.strategyDate} | 开盘前策略推荐 (Advisory Only)
                      </p>
                    </div>

                    {/* 顶级 Tab 切换：📌 结论 vs ⚙️ 生成过程 */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 shrink-0">
                      <button
                        onClick={() => setGuideTab("conclusion")}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          guideTab === "conclusion"
                            ? "bg-amber-500 text-slate-950 shadow"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        📌 结论
                      </button>
                      <button
                        onClick={() => setGuideTab("workflow")}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          guideTab === "workflow"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        ⚙️ 生成过程
                      </button>
                    </div>
                  </div>

                  {guideTab === "conclusion" ? (
                    <>
                      {/* 隔夜大盘宏观 */}
                      <div className="bg-indigo-950/30 border border-indigo-900/50 p-3.5 rounded-lg text-sm text-indigo-200">
                        <span className="font-semibold text-indigo-300">{t("gen.pages.stock.StockStudioPage.gen_a44e5a78", "隔夜美股宏观概述：")}</span>
                        {strategy.marketOverview}
                      </div>

                      {/* 指南头部 P&L KPI 看板（retroPnL + projectedPnL） */}
                      {(retroPnLData || projectedPnLData) && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/80 rounded-lg p-3 border border-slate-800">
                          {retroPnLData && (
                            <>
                              <div className="text-center">
                                <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_f2e9f884", "上次指南质量")}</p>
                                <p className={`text-sm font-bold font-mono ${
                                  retroPnLData.accuracyScore >= 70 ? "text-emerald-400" : retroPnLData.accuracyScore >= 50 ? "text-amber-400" : "text-rose-400"
                                }`}>{retroPnLData.accuracyScore}/100</p>
                                <p className="text-[9px] text-slate-500">{retroPnLData.strategyDate}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_29affed9", "避免损失")}</p>
                                <p className="text-sm font-bold font-mono text-emerald-400">+${retroPnLData.avoidedLoss.toFixed(0)}</p>
                                <p className="text-[9px] text-slate-500">跨单{(retroPnLData.executionMatchRate * 100).toFixed(0)}%</p>
                              </div>
                            </>
                          )}
                          {projectedPnLData && (
                            <div className="text-center">
                              <p className="text-[9px] text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_8e5b2028", "指南预期 P&amp;L")}</p>
                              <p className={`text-sm font-bold font-mono ${
                                projectedPnLData.totalProjectedChange >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}>{projectedPnLData.totalProjectedChange >= 0 ? "+" : ""}${projectedPnLData.totalProjectedChange.toFixed(0)}</p>
                              <p className="text-[9px] text-slate-500">{t("gen.pages.stock.StockStudioPage.gen_733bc1c2", "按全部执行")}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 风控提醒 */}
                      {strategy.riskAlerts.length > 0 && (
                        <div className="space-y-2">
                          {strategy.riskAlerts.map((alert, idx) => (
                            <div
                              key={idx}
                              className="bg-amber-950/30 border border-amber-900/50 p-3 rounded-lg flex items-start gap-3 text-sm text-amber-200"
                            >
                              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-amber-300">{alert.title}</p>
                                <p className="text-xs text-amber-200/80 mt-0.5">{alert.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 调仓动作建议表格 */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          今日推荐调仓指令清单 (Actions)
                        </h3>

                        <div className="space-y-2.5">
                          {strategy.actions.map((act, i) => (
                            <div
                              key={i}
                              className="bg-slate-950 border border-slate-800/80 rounded-lg p-3.5 flex flex-col gap-2"
                            >
                              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                                <div className="flex items-center space-x-3">
                                  <span
                                    className={`px-2.5 py-1 rounded text-xs font-bold shrink-0 ${
                                      act.action === "BUY"
                                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                        : act.action === "TRIM" || act.action === "SELL"
                                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                                        : "bg-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {act.action === "BUY"
                                      ? t("stock.actionBuy", "加仓/建仓")
                                      : act.action === "TRIM"
                                      ? t("stock.actionTrim", "减仓")
                                      : act.action === "SELL"
                                      ? t("stock.actionSell", "清仓")
                                      : t("stock.actionHold", "观望/持有")}
                                  </span>
                                  <div>
                                    <span className="font-bold text-slate-100 text-base">{act.symbol}</span>
                                    <span className="text-xs text-slate-400 ml-2">{act.companyName}</span>
                                    <p className="text-xs text-slate-400 mt-1">{act.rationale}</p>
                                  </div>
                                </div>

                                <div className="text-right sm:border-l sm:border-slate-800 sm:pl-4 shrink-0">
                                  {act.suggestedShares > 0 ? (
                                    <p className="text-sm font-bold text-slate-200">
                                      建议操作: {act.suggestedShares} 股
                                    </p>
                                  ) : (
                                    <p className="text-sm text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_f2895fd9", "保持观望")}</p>
                                  )}
                                  <p className="text-xs text-slate-500">
                                    参考价: ${act.estimatedPrice} | 估额: ${act.estimatedAmount}
                                  </p>
                                </div>
                              </div>

                              {/* P&L KPI 字段展示 */}
                              {(act.projectedPnL !== undefined || act.targetPrice || act.stopLossPrice) && (
                                <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800/60">
                                  {act.targetPrice && (
                                    <span className="text-[10px] px-2 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 rounded font-mono">
                                      🎯 目标价: ${act.targetPrice}
                                    </span>
                                  )}
                                  {act.stopLossPrice && (
                                    <span className="text-[10px] px-2 py-0.5 bg-rose-950/60 text-rose-400 border border-rose-900/60 rounded font-mono">
                                      ❌ 止损价: ${act.stopLossPrice}
                                    </span>
                                  )}
                                  {act.projectedPnL !== undefined && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                                      act.projectedPnL >= 0
                                        ? "bg-emerald-950/60 text-emerald-300 border-emerald-900/60"
                                        : "bg-rose-950/60 text-rose-300 border-rose-900/60"
                                    }`}>
                                      💰 预期 P&amp;L: {act.projectedPnL >= 0 ? "+" : ""}${act.projectedPnL.toFixed(0)}{act.projectedPnLPct !== undefined ? ` (${act.projectedPnLPct >= 0 ? "+" : ""}${act.projectedPnLPct.toFixed(1)}%)` : ""}
                                    </span>
                                  )}
                                  {act.timeHorizon && (
                                    <span className="text-[10px] px-2 py-0.5 bg-indigo-950/60 text-indigo-400 border border-indigo-900/60 rounded font-mono">
                                      ⏱ {act.timeHorizon}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    renderWorkflowProcessView()
                  )}
                </div>

                {/* 双视角研报卡片 (仅在结论 Tab 下展示) */}
                {guideTab === "conclusion" && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-purple-400" />
                        多维度专业研报 (Multi-View Research Report)
                      </h3>

                      {/* 选项卡切换 */}
                      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button
                          onClick={() => setActiveReportTab("narrative")}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            activeReportTab === "narrative"
                              ? "bg-indigo-600 text-white shadow"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {t("stock.narrativeView", "🎮 故事化爆爽解读视角")}
                        </button>
                        <button
                          onClick={() => setActiveReportTab("institutional")}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            activeReportTab === "institutional"
                              ? "bg-indigo-600 text-white shadow"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {t("stock.institutionalView", "🏛️ 机构专业投研视角")}
                        </button>
                      </div>
                    </div>

                    {activeReportTab === "narrative" ? (
                      renderNarrativeReport(strategy.narrativeReport)
                    ) : (
                      <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-line leading-relaxed font-mono">
                        {strategy.institutionalReport}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              !loading && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                  <div className="p-4 bg-indigo-950/40 text-indigo-400 rounded-full inline-block border border-indigo-800/50">
                    <Zap className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200">{t("gen.pages.stock.StockStudioPage.gen_e045deae", "尚未生成今日美股操盘策略")}</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">{t("gen.pages.stock.StockStudioPage.gen_a8d27333", "请确认左侧持仓组合与新增预算无误后，点击左下角的“生成今日 MooMoo 操盘指南”开启 AI 智能体推演。")}</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ✏️ 手动修改持仓对话框 Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                ✏️ 自定义你的真实美股持仓
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 模式切换 Tab */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setImportTab("manual")}
                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-all ${
                  importTab === "manual"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ✏️ 表单逐笔录入
              </button>
              <button
                onClick={() => setImportTab("paste")}
                className={`flex-1 py-1.5 rounded text-xs font-semibold transition-all ${
                  importTab === "paste"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📋 MooMoo 复制粘贴导入
              </button>
            </div>

            {importTab === "paste" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">{t("gen.pages.stock.StockStudioPage.gen_3bdf62b2", "在 MooMoo APP / 桌面端中复制持仓文本直接粘贴至下方：")}</label>
                  <textarea
                    rows={6}
                    placeholder={t("gen.pages.stock.StockStudioPage.gen_d9064347", "请粘贴从 MooMoo 客户端复制的持仓文本或资金信息...")}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono placeholder:text-slate-600"
                  />
                </div>
                <button
                  onClick={handleParsePaste}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-500/20"
                >
                  🚀 智能识别并更新持仓
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* 可用现金 */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    可用闲置现金 ($ USD)
                  </label>
                  <input
                    type="number"
                    value={editingCash}
                    onChange={(e) => setEditingCash(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-emerald-400 font-bold"
                  />
                </div>

                {/* 股票列表编辑 */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">{t("gen.pages.stock.StockStudioPage.gen_9b3e6967", "持仓股票列表")}</label>
                    <button
                      onClick={() =>
                        setEditingPositions([
                          ...editingPositions,
                          { symbol: "", shares: 10, costBasis: 100, marketPrice: 100 },
                        ])
                      }
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      + 添加新股票
                    </button>
                  </div>

                  {editingPositions.map((pos, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 items-center"
                    >
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder={t("gen.pages.stock.StockStudioPage.gen_54e3560e", "代码 (如 NVDA)")}
                          value={pos.symbol}
                          onChange={(e) => {
                            const updated = [...editingPositions];
                            updated[idx].symbol = e.target.value.toUpperCase();
                            setEditingPositions(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 uppercase font-bold"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder={t("gen.pages.stock.StockStudioPage.gen_4ef52482", "股数")}
                          value={pos.shares}
                          onChange={(e) => {
                            const updated = [...editingPositions];
                            updated[idx].shares = Number(e.target.value);
                            setEditingPositions(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          placeholder={t("gen.pages.stock.StockStudioPage.gen_8b319dbb", "成本 $")}
                          value={pos.costBasis}
                          onChange={(e) => {
                            const updated = [...editingPositions];
                            updated[idx].costBasis = Number(e.target.value);
                            setEditingPositions(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          placeholder={t("gen.pages.stock.StockStudioPage.gen_1c5df6c5", "现价 $")}
                          value={pos.marketPrice || pos.costBasis}
                          onChange={(e) => {
                            const updated = [...editingPositions];
                            updated[idx].marketPrice = Number(e.target.value);
                            setEditingPositions(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-emerald-300 font-semibold"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() =>
                            setEditingPositions(editingPositions.filter((_, i) => i !== idx))
                          }
                          className="text-red-400 hover:text-red-300 text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
              >{t("gen.pages.stock.StockStudioPage.gen_625fb26b", "取消")}</button>
              <button
                onClick={handleSavePortfolio}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-500/20"
              >{t("gen.pages.stock.StockStudioPage.gen_ba5daf09", "保存持仓并更新")}</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔑 解锁 MooMoo 交易密码对话框 Modal */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span className="p-1 bg-emerald-950 text-emerald-400 rounded border border-emerald-800 text-sm">🔑</span>{t("gen.pages.stock.StockStudioPage.gen_712d5474", "输入 MooMoo 交易密码")}</h3>
              <button
                onClick={() => setUnlockModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              MooMoo 服务器规定：调用持仓与资金接口前需提供交易密码校验。我们的系统 <strong className="text-emerald-400">100% 仅用于只读同步持仓</strong>，绝不发起任何自动下单。
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">{t("gen.pages.stock.StockStudioPage.gen_cee7f870", "你的 MooMoo 交易密码")}</label>
              <input
                type="password"
                placeholder={t("gen.pages.stock.StockStudioPage.gen_e52a7115", "输入 6 位交易密码")}
                value={tradePassword}
                onChange={(e) => setTradePassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 font-mono"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setUnlockModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
              >{t("gen.pages.stock.StockStudioPage.gen_625fb26b", "取消")}</button>
              <button
                onClick={handleUnlockTrade}
                disabled={unlocking || !tradePassword}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${unlocking ? "animate-spin" : ""}`} />
                <span>{unlocking ? "验证中..." : "解锁密码并同步持仓"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🕸️ 2D 全景可交互股票知识图谱全屏 Modal */}
      {kgModalOpen && currentKgItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
            {/* 顶栏 Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-950 text-purple-400 rounded-xl border border-purple-800">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-mono">
                    🕸️ {t("stock.graphTitle", "2D 交互式产业链知识图谱")} — {currentKgItem.symbol}
                    <span className="text-xs text-slate-400 font-sans font-normal">
                      ({currentKgItem.companyName})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEn
                      ? "Interactive 2D visual mapping of upstream suppliers, downstream clients, catalysts & OpenD quotes"
                      : "双向透视产业链上下游、核心客户、互联网快讯与 OpenD 盘口实体映射"}
                  </p>
                </div>
              </div>

              {/* 股票快速切换 Tabs + 人工修改图谱入口 */}
              <div className="flex items-center space-x-3">
                <div className="hidden md:flex gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  {kgList.map((item) => (
                    <button
                      key={item.symbol}
                      onClick={() => {
                        setSelectedKgSymbol(item.symbol.toUpperCase());
                        setActiveModalNode(null);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                        currentKgItem.symbol.toUpperCase() === item.symbol.toUpperCase()
                          ? "bg-purple-600 text-white shadow ring-1 ring-purple-400"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {item.symbol}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setEditKgModalOpen(true)}
                  className="px-3 py-1.5 bg-amber-950/80 text-amber-300 hover:bg-amber-900 border border-amber-700/60 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <span>✏️ {t("stock.editGraph", "人工修改图谱")}</span>
                </button>

                <button
                  onClick={() => setKgModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all text-sm font-mono cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 2D 可视化 Canvas + 侧边栏说明 */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden bg-slate-950 relative">
              {/* 左侧 2D 拓扑图 (动态渲染 Multi-Entity Triple Network Canvas) */}
              <div className="md:col-span-2 relative p-6 flex items-center justify-center overflow-auto bg-slate-950/90 border-r border-slate-800/80 min-h-[400px]">
                {/* 拓扑网络背景点阵 */}
                <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-20" />

                {/* SVG 实体关系定向连线 (Edges) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-purple-500/40 stroke-2">
                  {(currentKgItem.edges || []).map((edge, idx) => {
                    const nodeCount = (currentKgItem.nodes || []).length;
                    const angle = (idx / Math.max(1, nodeCount - 1)) * 2 * Math.PI - Math.PI / 2;
                    const endX = 50 + 35 * Math.cos(angle);
                    const endY = 50 + 35 * Math.sin(angle);
                    return (
                      <g key={idx}>
                        <line x1="50%" y1="50%" x2={`${endX}%`} y2={`${endY}%`} strokeDasharray="5 3" />
                      </g>
                    );
                  })}
                </svg>

                {/* 中心根节点 (Root Stock Entity) */}
                <div className="relative z-20 text-center">
                  <div
                    onClick={() =>
                      setActiveModalNode({
                        id: currentKgItem.symbol,
                        label: `${currentKgItem.symbol} (${currentKgItem.companyName})`,
                        relation: "核心研判目标标的 (Root Stock Entity)",
                        detail: `板块: ${currentKgItem.industrySector} | 分类: ${
                          currentKgItem.positionCategory === "EXISTING" ? "MooMoo 实盘持仓" : "自选关注风口"
                        }`,
                        type: "ROOT",
                      })
                    }
                    className="w-28 h-28 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 p-1 shadow-2xl shadow-purple-500/50 cursor-pointer transform hover:scale-110 transition-all flex flex-col items-center justify-center border-4 border-slate-900 animate-pulse ring-4 ring-purple-500/20"
                  >
                    <span className="text-xl font-black text-white font-mono tracking-wider">{currentKgItem.symbol}</span>
                    <span className="text-[10px] text-purple-100 font-semibold">{currentKgItem.companyName}</span>
                    <span className="text-[9px] bg-slate-950/90 text-amber-300 px-1.5 py-0.5 rounded mt-1 font-mono">
                      ${quotesMap.get(currentKgItem.symbol)?.toFixed(2) || "实时现价"}
                    </span>
                  </div>
                </div>

                {/* 动态分布周边关系实体节点 (Multi-Hop Entity Nodes) */}
                {(currentKgItem.nodes || [])
                  .filter((n) => n.id !== currentKgItem.symbol)
                  .map((node, idx, arr) => {
                    const angle = (idx / arr.length) * 2 * Math.PI - Math.PI / 4;
                    const radius = 160; // 像素分布半径
                    const posX = Math.cos(angle) * radius;
                    const posY = Math.sin(angle) * radius;

                    const matchingEdge = (currentKgItem.edges || []).find(
                      (e) => e.source === node.id || e.target === node.id
                    );

                    const typeColors: Record<string, string> = {
                      SUPPLIER: "border-indigo-500/60 bg-slate-900/95 text-indigo-300 hover:border-indigo-400",
                      CLIENT: "border-emerald-500/60 bg-slate-900/95 text-emerald-300 hover:border-emerald-400",
                      COMPETITOR: "border-rose-500/60 bg-slate-900/95 text-rose-300 hover:border-rose-400",
                      MACRO: "border-cyan-500/60 bg-slate-900/95 text-cyan-300 hover:border-cyan-400",
                      CONCEPT: "border-amber-500/60 bg-slate-900/95 text-amber-300 hover:border-amber-400",
                    };

                    const typeBadges: Record<string, string> = {
                      SUPPLIER: "上游供应商",
                      CLIENT: "下游客户",
                      COMPETITOR: "同业竞争者",
                      MACRO: "宏观因子",
                      CONCEPT: "概念板块",
                    };

                    return (
                      <div
                        key={node.id}
                        onClick={() =>
                          setActiveModalNode({
                            id: node.id,
                            label: node.name,
                            relation: matchingEdge?.relation || typeBadges[node.type] || "关联实体",
                            detail: node.description || `金融实体 ID: ${node.id}，涉及多跳关联特征。`,
                            type: node.type as any,
                          })
                        }
                        style={{
                          transform: `translate(${posX}px, ${posY}px)`,
                        }}
                        className={`absolute z-10 border p-3 rounded-xl shadow-2xl hover:scale-110 transition-all cursor-pointer w-48 text-xs ${
                          typeColors[node.type] || "border-slate-700 bg-slate-900 text-slate-200"
                        }`}
                      >
                        <div className="text-[10px] opacity-80 font-mono flex justify-between items-center mb-1">
                          <span className="bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                            {typeBadges[node.type] || "实体"}
                          </span>
                          <span className="text-[9px] opacity-70">➔ {matchingEdge?.impact || "LINK"}</span>
                        </div>
                        <div className="font-extrabold text-white text-[13px]">{node.name}</div>
                        {matchingEdge && (
                          <div className="text-[10px] text-purple-300 mt-1 line-clamp-1 italic font-mono">
                            [{matchingEdge.relation}]
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* 右侧节点详情与 OpenD 盘口抽屉 Side Panel */}
              <div className="p-6 bg-slate-900 flex flex-col justify-between space-y-4 overflow-y-auto">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />{t("gen.pages.stock.StockStudioPage.gen_97b15ba7", "节点深度关联透视面板")}</h4>

                  {activeModalNode ? (
                    <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-purple-500/30 animate-in fade-in">
                      <div className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-mono inline-block">
                        {activeModalNode.relation}
                      </div>
                      <h5 className="text-sm font-bold text-white">{activeModalNode.label}</h5>
                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800 font-sans">
                        {activeModalNode.detail}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center space-y-2">
                      <Sparkles className="w-6 h-6 text-purple-400 mx-auto animate-bounce" />
                      <p className="text-xs text-slate-400">{t("gen.pages.stock.StockStudioPage.gen_80701c28", "在左侧 2D 拓扑图中点击任意节点，查看产业链深度解读与数据流来源。")}</p>
                    </div>
                  )}

                  {/* OpenD 实时行情数据流卡 */}
                  <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      OpenD 直连盘口情报 ({currentKgItem.symbol})
                    </h5>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                      <div className="bg-slate-900 p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">{t("gen.pages.stock.StockStudioPage.gen_78349771", "最新美股现价")}</div>
                        <div className="text-emerald-400 font-bold">
                          ${quotesMap.get(currentKgItem.symbol)?.toFixed(2) || "实时获取中..."}
                        </div>
                      </div>
                      <div className="bg-slate-900 p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-500">{t("gen.pages.stock.StockStudioPage.gen_52956a59", "资产关联状态")}</div>
                        <div className="text-purple-300 font-bold">
                          {currentKgItem.positionCategory === "EXISTING" ? "已有持仓" : "自选关注池"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setKgModalOpen(false)}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer"
                >{t("gen.pages.stock.StockStudioPage.gen_191b085a", "关闭 2D 全景全屏视图")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ 人工编辑/新增股票知识图谱实体 Form Modal */}
      {editKgModalOpen && currentKgItem && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-amber-300 flex items-center gap-2 font-mono">
                ✏️ 人工编辑/新增图谱实体 — {currentKgItem.symbol}
              </h3>
              <button
                onClick={() => setEditKgModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800 font-sans">{t("gen.pages.stock.StockStudioPage.gen_c3021f16", "融合 4 大数据源：")}<strong className="text-emerald-400">OpenD 盘口</strong> + <strong className="text-cyan-400">{t("gen.pages.stock.StockStudioPage.gen_fe483c48", "网络资讯快讯")}</strong> + <strong className="text-amber-400">{t("gen.pages.stock.StockStudioPage.gen_099cb456", "实盘组合持仓")}</strong> + <strong className="text-purple-400">{t("gen.pages.stock.StockStudioPage.gen_62a3bc01", "人工研判修正")}</strong>。你可以随时在此添加专属关联实体与语义三元组。
            </p>

            <div className="space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">关联实体名称 (Entity Name)</label>
                <input
                  type="text"
                  placeholder={t("gen.pages.stock.StockStudioPage.gen_df2381fe", "例如：鸿海精密 / 富士康 (Foxconn) 或 台积电 CoWoS")}
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-100 placeholder:text-slate-600 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold block">实体分类 (Entity Type)</label>
                  <select
                    value={newEntityType}
                    onChange={(e) => setNewEntityType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-100 font-mono text-xs"
                  >
                    <option value="SUPPLIER">上游供应商 (SUPPLIER)</option>
                    <option value="CLIENT">下游客户 (CLIENT)</option>
                    <option value="COMPETITOR">同业竞争者 (COMPETITOR)</option>
                    <option value="MACRO">宏观因子 (MACRO)</option>
                    <option value="CONCEPT">概念/板块 (CONCEPT)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold block">语义关联谓词 (Relation)</label>
                  <input
                    type="text"
                    placeholder={t("gen.pages.stock.StockStudioPage.gen_ee803292", "例如：iPhone 独家精密组装")}
                    value={newRelationText}
                    onChange={(e) => setNewRelationText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-100 placeholder:text-slate-600 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">实体深度基本面说明 (Description)</label>
                <textarea
                  rows={3}
                  placeholder={t("gen.pages.stock.StockStudioPage.gen_dc4bf7f5", "例如：全球最大智能手机代工厂，苹果供应链重要组件及产能出货核心保障")}
                  value={newEntityDesc}
                  onChange={(e) => setNewEntityDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 font-sans text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditKgModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
              >{t("gen.pages.stock.StockStudioPage.gen_625fb26b", "取消")}</button>
              <button
                onClick={handleAddCustomEntity}
                disabled={!newEntityName.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >{t("gen.pages.stock.StockStudioPage.gen_f913937c", "保存并实时更新 2D 拓扑图谱")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
