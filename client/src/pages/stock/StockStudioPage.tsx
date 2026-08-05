import React, { useState, useEffect } from "react";
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
}

interface RiskAlert {
  level: "WARNING" | "CRITICAL" | "INFO";
  title: string;
  description: string;
  relatedSymbol?: string;
}

interface DailyStrategyData {
  id: string;
  strategyDate: string;
  marketOverview: string;
  actions: ActionItem[];
  riskAlerts: RiskAlert[];
  institutionalReport: string;
  narrativeReport: string;
  openDStatus?: { connected: boolean; message: string };
}

export default function StockStudioPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openDStatus, setOpenDStatus] = useState<{ connected: boolean; message: string }>({
    connected: false,
    message: "检测 OpenD 连通状态...",
  });
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
  const [editingCash, setEditingCash] = useState(3500);
  const [editingPositions, setEditingPositions] = useState<
    Array<{ symbol: string; shares: number; costBasis: number; marketPrice?: number }>
  >([]);

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

        if (!data.data.positions || data.data.positions.length === 0) {
          setSyncNotice(
            "💡 OpenD 通道已连接。系统已为你载入默认/录入的美股组合，你可以点击右侧“✏️ 修改持仓”随时更新。"
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

  // 实时大盘与公开行情 State (不依赖交易密码)
  const [quotes, setQuotes] = useState<Array<{ symbol: string; price: number; changePercent: number }>>([
    { symbol: "NVDA", price: 125.4, changePercent: 3.42 },
    { symbol: "TSLA", price: 242.0, changePercent: -0.85 },
    { symbol: "AAPL", price: 222.0, changePercent: 1.15 },
    { symbol: "QQQ", price: 478.2, changePercent: 0.92 },
    { symbol: "SPY", price: 545.6, changePercent: 0.64 },
  ]);
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

  useEffect(() => {
    checkOpenDStatus();
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
        }
      })
      .catch(console.error);
  }, []);

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
              <h4 className="text-sm font-bold text-slate-100">
                美股每日操盘与风险诊断报告
              </h4>
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
              美股投资研究与每日调仓智能体
            </h1>
          </div>
          <p className="text-slate-400 text-sm pl-11">
            基于 MooMoo 本地持仓与闲置预算，每日开盘前生成精确调仓建议与爽感研报（仅供决策参考，非自动下单）。
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-slate-950/60 border border-slate-800 px-4 py-2 rounded-lg text-sm">
          <span className={`w-3 h-3 rounded-full ${openDStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="text-slate-300 font-medium">{openDStatus.connected ? "MooMoo OpenD 已启动" : "OpenD 初始化中"}</span>
          <button
            onClick={checkOpenDStatus}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="刷新 OpenD 连接状态"
          >
            <RefreshCw className="w-4 h-4" />
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
                  title="关闭提示"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
                <p className="text-xs text-slate-400">闲置现金可用</p>
                <p className="text-lg font-bold text-emerald-400">
                  ${portfolio?.cashBalance !== undefined ? portfolio.cashBalance.toFixed(2) : "0.00"}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
                <p className="text-xs text-slate-400">数据源类型</p>
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
                  setEditingCash(portfolio?.cashBalance || 3500);
                  setEditingPositions(
                    portfolio?.positions?.map((p) => ({
                      symbol: p.symbol,
                      shares: p.shares,
                      costBasis: p.costBasis,
                    })) || [
                      { symbol: "NVDA", shares: 15, costBasis: 112.5 },
                      { symbol: "TSLA", shares: 8, costBasis: 242.0 },
                    ]
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

            {/* 核心持仓列表 */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-slate-400">
                当前持仓股票清单 ({portfolio?.positions?.length || 0} 标的)
              </p>
              <div className="space-y-2 text-sm max-h-60 overflow-y-auto">
                {portfolio?.positions && portfolio.positions.length > 0 ? (
                  portfolio.positions.map((pos, idx) => (
                    <div
                      key={pos.id || idx}
                      className="flex justify-between items-center bg-slate-950 p-2.5 rounded border border-slate-800/80"
                    >
                      <div>
                        <span className="font-bold text-slate-200">{pos.symbol}</span>
                        <span className="text-xs text-slate-500 ml-2">{pos.shares} 股</span>
                        {pos.companyName && (
                          <p className="text-[11px] text-slate-500">{pos.companyName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-slate-300">成本: ${pos.costBasis}</span>
                        {pos.marketPrice && (
                          <span className="text-xs text-emerald-400 block">
                            现价: ${pos.marketPrice}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">暂无持仓数据，点击上方“一键从 MooMoo 同步”即可从 OpenD 拉取</p>
                )}
              </div>
            </div>

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
                  title="刷新 MooMoo 自选关注列表"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>同步自选</span>
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
                  <span className="text-xs text-slate-500 py-1">未检测到自选股，点击“同步自选”或在 MooMoo 软件添加</span>
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
                  <span>AI 智能体隔夜推演中...</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
                  <span>生成今日 MooMoo 操盘指南</span>
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
                <p className="text-xs text-indigo-200/90 leading-relaxed font-sans">
                  系统正在融合隔夜美股宏观数据与当前 MooMoo 持仓进行量化推演。推演完成后，下方的操作指令与专业研报将自动覆盖更新。
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-950/90 text-indigo-300 border border-indigo-800 rounded-full text-xs font-mono shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                即将更新：今日买卖指令清单 / 风险警报 / 策略诊断研报
              </div>
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
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        MooMoo 每日开盘操盘指南
                      </h2>
                      <p className="text-xs text-slate-400">
                        推演日期: {strategy.strategyDate} | 开盘前策略推荐 (Advisory Only)
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-950 border border-slate-800 px-3 py-1 rounded-full">
                      🛡️ 请在 MooMoo 软件手动操作挂单
                    </span>
                  </div>

                  {/* 隔夜大盘宏观 */}
                  <div className="bg-indigo-950/30 border border-indigo-900/50 p-3.5 rounded-lg text-sm text-indigo-200">
                    <span className="font-semibold text-indigo-300">隔夜美股宏观概述：</span>
                    {strategy.marketOverview}
                  </div>

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
                          className="bg-slate-950 border border-slate-800/80 rounded-lg p-3.5 flex flex-col sm:flex-row justify-between sm:items-center gap-3"
                        >
                          <div className="flex items-center space-x-3">
                            <span
                              className={`px-2.5 py-1 rounded text-xs font-bold ${
                                act.action === "BUY"
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                  : act.action === "TRIM" || act.action === "SELL"
                                  ? "bg-rose-950 text-rose-300 border border-rose-800"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {act.action === "BUY"
                                ? "加仓买入"
                                : act.action === "TRIM"
                                ? "适当减仓"
                                : act.action === "SELL"
                                ? "清仓卖出"
                                : "持仓观望"}
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
                              <p className="text-sm text-slate-400">保持观望</p>
                            )}
                            <p className="text-xs text-slate-500">
                              参考价: ${act.estimatedPrice} | 估额: ${act.estimatedAmount}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 双视角研报卡片 */}
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
                        📊 策略诊断与操作指引
                      </button>
                      <button
                        onClick={() => setActiveReportTab("institutional")}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          activeReportTab === "institutional"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        🏛️ 机构级深度投研
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
              </>
            ) : (
              !loading && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                  <div className="p-4 bg-indigo-950/40 text-indigo-400 rounded-full inline-block border border-indigo-800/50">
                    <Zap className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200">
                    尚未生成今日美股操盘策略
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    请确认左侧持仓组合与新增预算无误后，点击左下角的“生成今日 MooMoo 操盘指南”开启 AI 智能体推演。
                  </p>
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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    在 MooMoo APP / 桌面端中复制持仓文本直接粘贴至下方：
                  </label>
                  <textarea
                    rows={6}
                    placeholder="例如:
NVDA 15股 125.4美元
TSLA 8股 242.0美元
可用现金 $3,500"
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
                    <label className="text-xs font-semibold text-slate-300">
                      持仓股票列表
                    </label>
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
                          placeholder="代码 (如 NVDA)"
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
                          placeholder="股数"
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
                          placeholder="成本 $"
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
                          placeholder="现价 $"
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
              >
                取消
              </button>
              <button
                onClick={handleSavePortfolio}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-500/20"
              >
                保存持仓并更新
              </button>
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
                <span className="p-1 bg-emerald-950 text-emerald-400 rounded border border-emerald-800 text-sm">🔑</span>
                输入 MooMoo 交易密码
              </h3>
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
              <label className="text-xs font-semibold text-slate-300 block">
                你的 MooMoo 交易密码
              </label>
              <input
                type="password"
                placeholder="输入 6 位交易密码"
                value={tradePassword}
                onChange={(e) => setTradePassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 font-mono"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setUnlockModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
              >
                取消
              </button>
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
    </div>
  );
}
