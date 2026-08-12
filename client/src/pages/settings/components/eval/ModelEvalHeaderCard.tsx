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
              <ShieldCheck className="w-3 h-3" />
              就绪
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            模型全模态评估与硬件路由基准控制台
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            实时探测本地 GPU/内存算力，自动运行 8 大模态基准测试（LLM, Embedding, 生图, 音频, OCR），为系统自动推荐与绑定最优性能落地模型。
          </p>
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
        <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2 rounded-xl border border-slate-800/60">
            <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">显卡设备 (GPU)</div>
              <div className="font-bold text-slate-200 truncate">{hardware.gpuName || "CPU 共享运算"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2 rounded-xl border border-slate-800/60">
            <HardDrive className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">显存 / 内存 (VRAM / RAM)</div>
              <div className="font-bold text-indigo-300">
                {hardware.vramGb > 0 ? `${hardware.vramGb} GB VRAM` : `${hardware.totalRamGb} GB RAM`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2 rounded-xl border border-slate-800/60">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">推荐量化与梯队</div>
              <div className="font-bold text-amber-300 truncate">{hardware.recommendedQuantization}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-slate-950/50 px-3.5 py-2 rounded-xl border border-slate-800/60">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">在线可用模型</div>
              <div className="font-bold text-cyan-300">{discoveredModelCount} 个模型已准备</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
