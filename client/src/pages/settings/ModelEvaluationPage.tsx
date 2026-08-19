import i18next from "i18next";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { discoverEvalModels, getEvalBenchmarks, applySmartAutoRoutes } from "@/api/eval";
import ModelEvalHeaderCard from "./components/eval/ModelEvalHeaderCard";
import EvaluationDashboardTab from "./components/eval/EvaluationDashboardTab";
import SingleModelDiagnosticTab from "./components/eval/SingleModelDiagnosticTab";
import MultiModelArenaTab from "./components/eval/MultiModelArenaTab";
import BenchmarkDatasetManagerTab from "./components/eval/BenchmarkDatasetManagerTab";
import { BarChart2, Zap, Swords, Database } from "lucide-react";

export default function ModelEvaluationPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "single" | "arena" | "datasets">("dashboard");

  const discoveryQuery = useQuery({
    queryKey: ["eval", "models", "discover"],
    queryFn: discoverEvalModels,
  });

  const benchmarksQuery = useQuery({
    queryKey: ["eval", "benchmarks"],
    queryFn: () => getEvalBenchmarks(),
  });

  const applyAutoRoutesMutation = useMutation({
    mutationFn: () => applySmartAutoRoutes(),
    onSuccess: (res) => {
      if (res.success && res.data) {
        alert(i18next.t("settings.modelEvaluationPage.6fsu65", { val1: res.data.updatedCount }));
        void queryClient.invalidateQueries({ queryKey: ["eval"] });
      }
    },
  });

  const hardware = discoveryQuery.data?.data?.hardware || null;
  const discoveredModels = discoveryQuery.data?.data?.models || [];
  const benchmarks = benchmarksQuery.data?.data || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
      {/* Header Banner */}
      <ModelEvalHeaderCard
        hardware={hardware}
        discoveredModelCount={discoveredModels.length}
        onApplyAutoRoutes={() => applyAutoRoutesMutation.mutate()}
        isApplying={applyAutoRoutesMutation.isPending}
      />

      {/* View Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 font-mono text-xs">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === "dashboard"
              ? "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800"
          }`}
        >
          <BarChart2 className="w-4 h-4" />{i18next.t("settings.modelEvaluationPage.3tamal")}</button>

        <button
          onClick={() => setActiveTab("single")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === "single"
              ? "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />{i18next.t("settings.modelEvaluationPage.nrw1yv")}</button>

        <button
          onClick={() => setActiveTab("arena")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === "arena"
              ? "bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Swords className="w-4 h-4 text-purple-300" />{i18next.t("settings.modelEvaluationPage.quqlsa")}</button>

        <button
          onClick={() => setActiveTab("datasets")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === "datasets"
              ? "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800"
          }`}
        >
          <Database className="w-4 h-4" />{i18next.t("settings.modelEvaluationPage.1iuaqn")}</button>
      </div>

      {/* Main View Tab Display */}
      {activeTab === "dashboard" && (
        <EvaluationDashboardTab
          hardware={hardware}
          discoveredModels={discoveredModels}
          onApplyAutoRoutes={() => applyAutoRoutesMutation.mutate()}
        />
      )}

      {activeTab === "single" && (
        <SingleModelDiagnosticTab discoveredModels={discoveredModels} />
      )}

      {activeTab === "arena" && (
        <MultiModelArenaTab discoveredModels={discoveredModels} benchmarks={benchmarks} />
      )}

      {activeTab === "datasets" && (
        <BenchmarkDatasetManagerTab
          benchmarks={benchmarks}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ["eval", "benchmarks"] })}
        />
      )}
    </div>
  );
}
