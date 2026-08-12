import i18next from "i18next";
import React, { useState } from "react";
import { Plus, Database, Tag, Sparkles } from "lucide-react";
import type { BenchmarkTestCase } from "@/api/eval";
import CreateTestCaseModal from "./CreateTestCaseModal";

interface Props {
  benchmarks: BenchmarkTestCase[];
  onRefresh: () => void;
}

export default function BenchmarkDatasetManagerTab({ benchmarks, onRefresh }: Props) {
  const [activeCap, setActiveCap] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = activeCap === "all" ? benchmarks : benchmarks.filter((b) => b.capability === activeCap);

  return (
    <div className="space-y-6">
      {/* 模块顶栏 */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md">
        <div>
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />{i18next.t("settings.benchmarkDatasetManagerTab.rnysf0")}</h3>
          <p className="text-xs text-slate-400">{i18next.t("settings.benchmarkDatasetManagerTab.fenhg7")}</p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />{i18next.t("settings.benchmarkDatasetManagerTab.pfw008")}</button>
      </div>

      {/* 8 大模态过滤 Pill Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs font-mono">
        {["all", "text-gen", "embedding", "sparse", "image-gen", "tts", "asr", "ocr"].map((cap) => (
          <button
            key={cap}
            onClick={() => setActiveCap(cap)}
            className={`px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
              activeCap === cap
                ? "bg-indigo-600 border-indigo-500 text-white font-bold shadow-md"
                : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {cap === "all" ? "全部模态" : cap}
          </button>
        ))}
      </div>

      {/* 用例卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="md:col-span-2 py-12 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">{i18next.t("settings.benchmarkDatasetManagerTab.x2y78v")}</div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-bold text-slate-100">{item.title}</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    item.isBuiltin ? "bg-indigo-950 text-indigo-300 border border-indigo-800" : "bg-purple-950 text-purple-300 border border-purple-800"
                  }`}
                >
                  {item.isBuiltin ? "内置基准" : "自定义"}
                </span>
              </div>

              <div className="space-y-1.5 font-mono text-slate-300">
                <div className="text-[11px] text-slate-400">Prompt:</div>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {item.promptText}
                </div>
              </div>

              {item.expectedOutput && (
                <div className="text-[11px] font-mono text-slate-400">
                  <span className="text-emerald-400">Ground Truth:</span> {item.expectedOutput}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <CreateTestCaseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={onRefresh}
      />
    </div>
  );
}
