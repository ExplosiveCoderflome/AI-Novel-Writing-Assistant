import type {
  CreateMarketCreativeBriefRequest,
  MarketCreativeBrief,
  MarketRadarListSource,
  MarketRadarPlatform,
  MarketScanRun,
  StartMarketRadarAnalysisRequest,
  SyncMarketProductionFoundationRequest,
  MarketTrendReport,
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

export async function syncMarketProductionFoundation(reportId: string, payload: SyncMarketProductionFoundationRequest) {
  const { data } = await apiClient.post<ApiResponse<MarketTrendReport>>(`/market-radar/reports/${reportId}/foundation-sync`, payload);
  return data;
}
