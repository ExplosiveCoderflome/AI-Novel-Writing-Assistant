import i18next from "i18next";
import React from "react";
import { Award, Zap, ShieldCheck, FileText, Image as ImageIcon, Volume2, Search, Cpu } from "lucide-react";
import type { DiscoveredModelItem, SystemHardwareSpec } from "@/api/eval";

interface Props {
  hardware: SystemHardwareSpec | null;
  discoveredModels: DiscoveredModelItem[];
  onApplyAutoRoutes: () => void;
}

export default function EvaluationDashboardTab({ hardware, discoveredModels, onApplyAutoRoutes }: Props) {
  const capabilityCards = [
    {
      capability: "text-gen",
      title: i18next.t("settings.evaluationDashboardTab.hs1pjd"),
      icon: FileText,
      color: "from-indigo-500/20 to-purple-500/20 border-indigo-500/40 text-indigo-300",
      topModel: "ollama / muse-glimmer-30b",
      score: "4.8 / 5.0",
      metrics: "TTFT 180ms · 45.2 t/s · JSON 遵循率 100%",
    },
    {
      capability: "embedding",
      title: i18next.t("settings.evaluationDashboardTab.71dh48"),
      icon: Search,
      color: "from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-300",
      topModel: "bge-large-zh-v1.5",
      score: "4.9 / 5.0",
      metrics: "余弦 Margin 0.62 · Recall@5 96.5%",
    },
    {
      capability: "image-gen",
      title: i18next.t("settings.createTestCaseModal.2hf0s5"),
      icon: ImageIcon,
      color: "from-purple-500/20 to-pink-500/20 border-purple-500/40 text-purple-300",
      topModel: "comfyui / MiniMax-H3",
      score: "4.7 / 5.0",
      metrics: "CLIP Score 88.4 · 单图 4.2s · 8K 清晰度",
    },
    {
      capability: "tts",
      title: i18next.t("settings.evaluationDashboardTab.ii9hzv"),
      icon: Volume2,
      color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300",
      topModel: "Kokoro-v1.0 (离线)",
      score: "4.8 / 5.0",
      metrics: "NISQA 音质 4.6 · RTF 0.12x 超实时",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 硬件自适应建议区 */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-slate-100">{i18next.t("settings.evaluationDashboardTab.4k4989")}</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            实测 GPU: {hardware?.gpuName || "CPU"} | 显存: {hardware?.vramGb || 0}GB
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400 mb-1">{i18next.t("settings.evaluationDashboardTab.mieg2n")}</div>
            <div className="font-bold text-slate-200">7B Q4_K_M + SD 1.5</div>
            <div className="text-[11px] text-slate-500 mt-1">{i18next.t("settings.evaluationDashboardTab.7fhs17")}</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400 mb-1">{i18next.t("settings.evaluationDashboardTab.dp7wyv")}</div>
            <div className="font-bold text-indigo-300">14B INT8 + SDXL</div>
            <div className="text-[11px] text-slate-500 mt-1">{i18next.t("settings.evaluationDashboardTab.kpiobh")}</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-indigo-500/40 bg-indigo-950/20">
            <div className="text-indigo-300 mb-1 font-semibold">{i18next.t("settings.evaluationDashboardTab.tkrwly")}</div>
            <div className="font-bold text-purple-300">30B/32B Q4 + FLUX.1-dev</div>
            <div className="text-[11px] text-slate-400 mt-1">{i18next.t("settings.evaluationDashboardTab.httyj2")}</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <div className="text-slate-400 mb-1">{i18next.t("settings.evaluationDashboardTab.hx5xti")}</div>
            <div className="font-bold text-emerald-300">70B/72B Full + 音视频渲染</div>
            <div className="text-[11px] text-slate-500 mt-1">{i18next.t("settings.evaluationDashboardTab.lpzx26")}</div>
          </div>
        </div>
      </div>

      {/* 8 大模态榜首得分卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {capabilityCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div
              key={card.capability}
              className={`p-5 rounded-xl bg-gradient-to-br ${card.color} border backdrop-blur-md flex flex-col justify-between space-y-4`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100">{card.title}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">{i18next.t("settings.evaluationDashboardTab.8vf43e")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  {card.score}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 text-xs font-mono">
                <div className="font-bold text-slate-200 mb-1">{card.topModel}</div>
                <div className="text-slate-400 text-[11px]">{card.metrics}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 自动路由应用操作区 */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-slate-100">{i18next.t("settings.evaluationDashboardTab.tl48rz")}</h4>
          <p className="text-xs text-slate-400">{i18next.t("settings.evaluationDashboardTab.dxa7sm")}</p>
        </div>
        <button
          onClick={onApplyAutoRoutes}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all shrink-0"
        >{i18next.t("settings.evaluationDashboardTab.r0gbcv")}</button>
      </div>
    </div>
  );
}
