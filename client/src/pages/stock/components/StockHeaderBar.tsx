import React from "react";
import i18next from "i18next";
import { TrendingUp, RefreshCw } from "lucide-react";

interface StockHeaderBarProps {
  openDStatus: { connected: boolean; message: string };
  isEn: boolean;
  quotes: Array<{ symbol: string; price: number; changePercent: number }>;
  onCheckOpenDStatus: () => void;
  onRestartOpenD: () => void;
}

export function StockHeaderBar({
  openDStatus,
  isEn,
  quotes,
  onCheckOpenDStatus,
  onRestartOpenD,
}: StockHeaderBarProps) {
  return (
    <>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 rounded-xl p-5 gap-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-sky-300 to-purple-400 bg-clip-text text-transparent">
              {i18next.t("stock.title", { defaultValue: "美股 AI 智能投研与每日调仓工作台" })}
            </h1>
          </div>
          <p className="text-slate-400 text-sm pl-11">
            {i18next.t("stock.subtitle", { defaultValue: "整合 MooMoo OpenD 实时盘口、美股新闻热点与持仓风控，开盘前自动生成调仓指令清单" })}
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
            onClick={onCheckOpenDStatus}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
            title={isEn ? "Refresh OpenD connection status" : "刷新 OpenD 连接状态"}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onRestartOpenD}
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
          <span>{i18next.t("stock.stockStudioPage.nbjqw5")}</span>
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
    </>
  );
}
