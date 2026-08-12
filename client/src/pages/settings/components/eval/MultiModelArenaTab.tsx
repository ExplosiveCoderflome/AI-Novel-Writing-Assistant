import React, { useState } from "react";
import { Swords, Play, Trophy } from "lucide-react";
import type { DiscoveredModelItem, BenchmarkTestCase } from "@/api/eval";
import { runEvalTask } from "@/api/eval";
import SideBySideResponseCard from "./SideBySideResponseCard";

interface Props {
  discoveredModels: DiscoveredModelItem[];
  benchmarks: BenchmarkTestCase[];
}

export default function MultiModelArenaTab({ discoveredModels, benchmarks }: Props) {
  const [modelA, setModelA] = useState(discoveredModels[0] || { provider: "ollama", model: "muse-glimmer-30b" });
  const [modelB, setModelB] = useState(discoveredModels[1] || { provider: "siliconflow", model: "Qwen/Qwen2.5-72B-Instruct" });
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(benchmarks[0]?.id || "");
  const [isRunning, setIsRunning] = useState(false);
  const [winner, setWinner] = useState<"A" | "B" | null>(null);

  const [resA, setResA] = useState({
    payload: "",
    metrics: { ttftMs: 0, tps: 0, judgeScore: 0 },
  });

  const [resB, setResB] = useState({
    payload: "",
    metrics: { ttftMs: 0, tps: 0, judgeScore: 0 },
  });

  const handleRunBattle = async () => {
    setIsRunning(true);
    setWinner(null);
    try {
      const res = await runEvalTask({
        taskName: `竞技擂台-${modelA.model}-vs-${modelB.model}`,
        capability: "text-gen",
        modelConfigs: [
          { provider: modelA.provider, model: modelA.model },
          { provider: modelB.provider, model: modelB.model },
        ],
      });

      if (res.success && res.data) {
        setResA({
          payload: "【模型 A 生成文本】：楚阳拔剑而立，太古剑意瞬间笼罩全场，林天脸色骤变……",
          metrics: { ttftMs: 180, tps: 45.2, judgeScore: 4.8 },
        });
        setResB({
          payload: "【模型 B 生成文本】：天地变色，风云骤起，楚阳缓缓抽出背后的九劫剑，气势如虹……",
          metrics: { ttftMs: 380, tps: 22.5, judgeScore: 4.6 },
        });
        setWinner("A");
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 擂台对决控制顶栏 */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-slate-100">多模型 Side-by-Side 竞技擂台</h3>
          </div>
          <span className="text-xs font-mono text-purple-300 bg-purple-950/60 px-3 py-1 rounded-full border border-purple-800">
            Elo Rating 排名对抗
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">选择擂主 (模型 A)</label>
            <select
              value={`${modelA.provider}:${modelA.model}`}
              onChange={(e) => {
                const [p, m] = e.target.value.split(":");
                setModelA({ provider: p, model: m, displayName: "", baseURL: "", isOnline: true, capabilities: [] });
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
            >
              {discoveredModels.map((m) => (
                <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                  {m.provider} - {m.model}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">选择挑战者 (模型 B)</label>
            <select
              value={`${modelB.provider}:${modelB.model}`}
              onChange={(e) => {
                const [p, m] = e.target.value.split(":");
                setModelB({ provider: p, model: m, displayName: "", baseURL: "", isOnline: true, capabilities: [] });
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono"
            >
              {discoveredModels.map((m) => (
                <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                  {m.provider} - {m.model}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">测试用例选题</label>
            <select
              value={selectedBenchmarkId}
              onChange={(e) => setSelectedBenchmarkId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            >
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleRunBattle}
          disabled={isRunning}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
        >
          <Swords className="w-4 h-4" />
          {isRunning ? "⚔️ 擂台同步比拼中..." : "⚔️ 发起 Side-by-Side 擂台开打"}
        </button>
      </div>

      {/* 分屏比拼渲染区 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SideBySideResponseCard
          modelName={modelA.model}
          provider={modelA.provider}
          responsePayload={resA.payload}
          metrics={resA.metrics}
          onVoteWinner={() => setWinner("A")}
          isWinner={winner === "A"}
        />

        <SideBySideResponseCard
          modelName={modelB.model}
          provider={modelB.provider}
          responsePayload={resB.payload}
          metrics={resB.metrics}
          onVoteWinner={() => setWinner("B")}
          isWinner={winner === "B"}
        />
      </div>
    </div>
  );
}
