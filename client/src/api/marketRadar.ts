import type {
  CreateMarketCreativeBriefRequest,
  MarketCreativeBrief,
  MarketRadarListSource,
  MarketRadarPlatform,
  MarketScanRun,
  StartMarketRadarAnalysisRequest,
  MarketTrendReport,
  MarketSavedTopic,
} from "@ai-novel/shared/types/marketRadar";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export async function getMarketRadarSources() {
  const { data } = await apiClient.get<ApiResponse<MarketRadarListSource[]>>("/market-radar/sources");
  return data;
}

export async function startMarketRadarScan(platforms: MarketRadarPlatform[]) {
  const { data } = await apiClient.post<ApiResponse<MarketScanRun>>("/market-radar/scans", { platforms });
  return data;
}

export async function getLatestMarketRadarScan() {
  const { data } = await apiClient.get<ApiResponse<MarketScanRun | null>>("/market-radar/scans/latest");
  return data;
}

export async function getSavedMarketTopics() {
  const { data } = await apiClient.get<ApiResponse<MarketSavedTopic[]>>("/market-radar/saved-topics");
  return data;
}

export async function saveMarketTopic(reportId: string, signalId: string) {
  const { data } = await apiClient.post<ApiResponse<MarketSavedTopic>>("/market-radar/saved-topics", { reportId, signalId });
  return data;
}

export async function deleteSavedMarketTopic(id: string) {
  await apiClient.delete(`/market-radar/saved-topics/${id}`);
}

export async function getMarketRadarScan(id: string) {
  const { data } = await apiClient.get<ApiResponse<MarketScanRun>>(`/market-radar/scans/${id}`);
  return data;
}

export async function startMarketRadarAnalysis(id: string, payload: StartMarketRadarAnalysisRequest) {
  const { data } = await apiClient.post<ApiResponse<MarketScanRun>>(`/market-radar/scans/${id}/analysis`, payload);
  return data;
}

export async function createMarketCreativeBrief(payload: CreateMarketCreativeBriefRequest) {
  const { data } = await apiClient.post<ApiResponse<MarketCreativeBrief>>("/market-radar/briefs", payload);
  return data;
}

export async function getMarketCreativeBrief(id: string) {
  const { data } = await apiClient.get<ApiResponse<MarketCreativeBrief>>(`/market-radar/briefs/${id}`);
  return data;
}
