import i18next from "i18next";
import React from "react";
import { ThumbsUp, Trophy, Zap, Clock } from "lucide-react";

interface Props {
  modelName: string;
  provider: string;
  responsePayload: string;
  metrics: {
    ttftMs: number;
    tps: number;
    judgeScore: number;
  };
  onVoteWinner: () => void;
  isWinner?: boolean;
}

export default function SideBySideResponseCard({
  modelName,
  provider,
  responsePayload,
  metrics,
  onVoteWinner,
  isWinner,
}: Props) {
  return (
    <div
      className={`p-5 rounded-xl border backdrop-blur-md flex flex-col justify-between space-y-4 transition-all ${
        isWinner
          ? "bg-amber-950/20 border-amber-500/60 ring-2 ring-amber-500/40"
          : "bg-slate-900/60 border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h4 className="font-bold text-slate-100 font-mono text-sm">{modelName}</h4>
          <span className="text-[11px] text-slate-400 font-mono">{provider}</span>
        </div>

        <button
          onClick={onVoteWinner}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
            isWinner
              ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
          }`}
        >
          {isWinner ? <Trophy className="w-3.5 h-3.5 fill-current" /> : <ThumbsUp className="w-3.5 h-3.5" />}
          {isWinner ? "擂台胜出" : "投票胜出"}
        </button>
      </div>

      {/* 指标对比小牌 */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
        <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">TTFT</div>
          <div className="font-bold text-indigo-300">{metrics.ttftMs}ms</div>
        </div>
        <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">TPS</div>
          <div className="font-bold text-purple-300">{metrics.tps}t/s</div>
        </div>
        <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80">
          <div className="text-[10px] text-slate-400">{i18next.t("settings.sideBySideResponseCard.aqukoz")}</div>
          <div className="font-bold text-amber-300">{metrics.judgeScore}</div>
        </div>
      </div>

      {/* 生成内容显示区 */}
      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-xs text-slate-200 min-h-[160px] max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
        {responsePayload || "点击“⚔️ 擂台同步开打”查看分屏生成效果..."}
      </div>
    </div>
  );
}
