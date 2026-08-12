import i18next from "i18next";
import React from "react";
import { Cpu, HardDrive, ShieldCheck, Zap, Sparkles } from "lucide-react";
import type { SystemHardwareSpec } from "@/api/eval";

interface Props {
  hardware: SystemHardwareSpec | null;
  discoveredModelCount: number;
  onApplyAutoRoutes: () => void;
  isApplying: boolean;
}

export default function ModelEvalHeaderCard({
  hardware,
  discoveredModelCount,
  onApplyAutoRoutes,
  isApplying,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/80 to-purple-950/90 border border-indigo-500/30 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              AI 硬件架构与模型智能中枢
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3 h-3" />{i18next.t("settings.modelEvalHeaderCard.gdll")}</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">{i18next.t("settings.modelEvalHeaderCard.xjkysb")}</h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">{i18next.t("settings.modelEvalHeaderCard.a1mr1w")}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            onClick={onApplyAutoRoutes}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold shadow-lg shadow-indigo-500/25 transition-all duration-200 disabled:opacity-50 active:scale-95 text-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            {isApplying ? "正在应用模型路由..." : "一键应用最优智能模型路由"}
          </button>
        </div>
      </div>

      {/* Hardware Spec Quick Badge Bar */}
      {hardware && (
        <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2.5 rounded-xl border border-slate-800/60 min-w-0">
            <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-slate-400 text-[10px] truncate">{i18next.t("settings.modelEvalHeaderCard.9ompin")}</div>
              <div className="font-bold text-slate-200 truncate" title={hardware.gpuName || "CPU 共享运算"}>
                {hardware.gpuName || "CPU 共享运算"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2.5 rounded-xl border border-slate-800/60 min-w-0">
            <HardDrive className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-slate-400 text-[10px] truncate">{i18next.t("settings.modelEvalHeaderCard.87jdwi")}</div>
              <div className="font-bold text-indigo-300 truncate">
                {hardware.vramGb > 0 ? `${hardware.vramGb} GB VRAM` : `${hardware.totalRamGb} GB RAM`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2.5 rounded-xl border border-slate-800/60 min-w-0">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-slate-400 text-[10px] truncate">{i18next.t("settings.modelEvalHeaderCard.adygf")}</div>
              <div className="font-bold text-amber-300 truncate" title={hardware.recommendedQuantization}>
                {hardware.recommendedQuantization}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2.5 rounded-xl border border-slate-800/60 min-w-0">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-slate-400 text-[10px] truncate">{i18next.t("settings.modelEvalHeaderCard.a0sg3q")}</div>
              <div className="font-bold text-cyan-300 truncate">{discoveredModelCount} 个模型已准备</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
