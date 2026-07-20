import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface VideoProject {
  id: string;
  title: string;
  novelId: string | null;
  chapterIdsJson: string | null;
  sourceType: string;
  pipeline: string | null;
  status: string;
  scriptJson: string | null;
  renderTaskId: string | null;
  resultUrl: string | null;
  costEstimate: number | null;
  actualCost: number | null;
  errorMessage: string | null;
  configJson: string | null;
  novel: { id: string; title: string; description?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVideoProjectPayload {
  title: string;
  novelId?: string;
  chapterIds?: string[];
  sourceType?: "chapter_adaptation" | "trailer" | "custom";
  pipeline?: string;
  config?: Record<string, unknown>;
}

export interface VideoScriptOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  targetDurationSec?: number;
  visualStyle?: string;
}

export interface BridgeHealthResult {
  reachable: boolean;
  status?: string;
  vellum_reel_root?: string;
  tools_available?: boolean;
  tool_count?: number;
  toolsSummary?: Record<string, unknown>;
  toolNames?: string[];
  environment?: {
    node?: string;
    ffmpeg?: string;
    ffprobe?: string;
  };
  error?: string;
}

export async function listVideoProjects(novelId?: string) {
  const params = novelId ? `?novelId=${encodeURIComponent(novelId)}` : "";
  const { data } = await apiClient.get<ApiResponse<VideoProject[]>>(`/video/projects${params}`);
  return data;
}

export async function createVideoProject(payload: CreateVideoProjectPayload) {
  const { data } = await apiClient.post<ApiResponse<VideoProject>>("/video/projects", payload);
  return data;
}

export async function getVideoProject(id: string) {
  const { data } = await apiClient.get<ApiResponse<VideoProject>>(`/video/projects/${id}`);
  return data;
}

export async function deleteVideoProject(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/video/projects/${id}`);
  return data;
}

export async function generateVideoScript(projectId: string, options?: VideoScriptOptions) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/video/projects/${projectId}/script`, options ?? {});
  return data;
}

export async function submitVideoRender(projectId: string) {
  const { data } = await apiClient.post<ApiResponse<{ taskId: string; status: string }>>(`/video/projects/${projectId}/render`);
  return data;
}

export async function getVideoRenderStatus(projectId: string) {
  const { data } = await apiClient.get<ApiResponse<{
    task_id: string;
    status: string;
    progress: number;
    output_path: string | null;
    error: string | null;
    cost_usd: number;
  }>>(`/video/projects/${projectId}/render/status`);
  return data;
}

export async function checkBridgeHealth() {
  const { data } = await apiClient.get<ApiResponse<BridgeHealthResult>>("/video/bridge/health");
  return data;
}

export interface VideoOfflineSettings {
  offlineMode: boolean;
  ollamaModel: string;
  sdUrl: string;
  ttsUrl: string;
}

export async function getVideoOfflineSettings() {
  const { data } = await apiClient.get<ApiResponse<VideoOfflineSettings>>("/video/offline-settings");
  return data;
}

export async function saveVideoOfflineSettings(settings: Partial<VideoOfflineSettings>) {
  const { data } = await apiClient.post<ApiResponse<null>>("/video/offline-settings", settings);
  return data;
}
