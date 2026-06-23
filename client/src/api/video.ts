/**
 * 视频改编 API 客户端
 */
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
  openmontage_root?: string;
  tools_available?: boolean;
  tool_count?: number;
  toolsSummary?: Record<string, unknown>;
  toolNames?: string[];
  error?: string;
}

export async function listVideoProjects(novelId?: string) {
  const params = novelId ? `?novelId=${encodeURIComponent(novelId)}` : "";
  return apiClient.get<VideoProject[]>(`/video/projects${params}`);
}

export async function createVideoProject(payload: CreateVideoProjectPayload) {
  return apiClient.post<VideoProject>("/video/projects", payload);
}

export async function getVideoProject(id: string) {
  return apiClient.get<VideoProject>(`/video/projects/${id}`);
}

export async function deleteVideoProject(id: string) {
  return apiClient.delete<null>(`/video/projects/${id}`);
}

export async function generateVideoScript(projectId: string, options?: VideoScriptOptions) {
  return apiClient.post<unknown>(`/video/projects/${projectId}/script`, options ?? {});
}

export async function submitVideoRender(projectId: string) {
  return apiClient.post<{ taskId: string; status: string }>(`/video/projects/${projectId}/render`);
}

export async function getVideoRenderStatus(projectId: string) {
  return apiClient.get<{
    task_id: string;
    status: string;
    progress: number;
    output_path: string | null;
    error: string | null;
    cost_usd: number;
  }>(`/video/projects/${projectId}/render/status`);
}

export async function checkBridgeHealth() {
  return apiClient.get<BridgeHealthResult>("/video/bridge/health");
}
