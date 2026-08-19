import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface DiscoveredModelItem {
  provider: string;
  model: string;
  displayName: string;
  baseURL: string;
  isOnline: boolean;
  capabilities: string[];
}

export interface SystemHardwareSpec {
  gpuName: string | null;
  vramGb: number;
  totalRamGb: number;
  cpuCores: number;
  recommendedTier: "ENTRY" | "MAIN_STREAM" | "ENTHUSIAST" | "FLAGSHIP";
  recommendedQuantization: string;
}

export interface ModelDiscoveryResponseData {
  hardware: SystemHardwareSpec;
  models: DiscoveredModelItem[];
}

export interface BenchmarkTestCase {
  id: string;
  capability: string;
  category?: string | null;
  title: string;
  description?: string | null;
  promptText: string;
  expectedOutput?: string | null;
  metadataJson?: string | null;
  isBuiltin: boolean;
  createdAt?: string;
}

export interface ModelEvalTaskRecord {
  id: string;
  name: string;
  targetCapability: string;
  modelConfigsJson: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  progressPercent: number;
  overallScoresJson: string | null;
  createdAt: string;
  results?: Array<{
    id: string;
    provider: string;
    model: string;
    testCaseId: string;
    testCategory: string;
    metricsJson: string;
    outputPayload: string;
  }>;
}

export async function discoverEvalModels(): Promise<ApiResponse<ModelDiscoveryResponseData>> {
  const { data } = await apiClient.get<ApiResponse<ModelDiscoveryResponseData>>("/eval/models/discover");
  return data;
}

export async function getEvalBenchmarks(capability?: string): Promise<ApiResponse<BenchmarkTestCase[]>> {
  const params = capability ? { capability } : undefined;
  const { data } = await apiClient.get<ApiResponse<BenchmarkTestCase[]>>("/eval/benchmarks", { params });
  return data;
}

export async function createEvalBenchmark(payload: {
  capability: string;
  category?: string;
  title: string;
  description?: string;
  promptText: string;
  expectedOutput?: string;
}): Promise<ApiResponse<BenchmarkTestCase>> {
  const { data } = await apiClient.post<ApiResponse<BenchmarkTestCase>>("/eval/benchmarks", payload);
  return data;
}

export async function runEvalTask(payload: {
  taskName?: string;
  capability: string;
  modelConfigs: Array<{ provider: string; model: string; baseURL?: string }>;
}): Promise<ApiResponse<{ taskId: string; overallScores: Record<string, any> }>> {
  const { data } = await apiClient.post<ApiResponse<{ taskId: string; overallScores: Record<string, any> }>>("/eval/run", payload);
  return data;
}

export async function getEvalTaskDetails(taskId: string): Promise<ApiResponse<ModelEvalTaskRecord>> {
  const { data } = await apiClient.get<ApiResponse<ModelEvalTaskRecord>>(`/eval/tasks/${taskId}`);
  return data;
}

export async function applySmartAutoRoutes(payload?: {
  targetProvider?: string;
  targetModel?: string;
}): Promise<ApiResponse<{ updatedCount: number; routes: Record<string, { provider: string; model: string }> }>> {
  const { data } = await apiClient.post<ApiResponse<{ updatedCount: number; routes: Record<string, { provider: string; model: string }> }>>(
    "/eval/apply-auto-routes",
    payload,
  );
  return data;
}
