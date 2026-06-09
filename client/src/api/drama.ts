import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export type DramaSourceType = "novel_import" | "original" | "text_import";

export interface DramaLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface DramaTrackRecommendation {
  recommendedTrack: string;
  reason: string;
  fitSignals: string[];
  risks: string[];
  alternatives: Array<{
    track: string;
    reason: string;
  }>;
}

export interface DramaSourceSupplementGuidance {
  readiness: "ready" | "needs_supplement" | "needs_rebuild";
  summary: string;
  missingItems: Array<{
    area: string;
    problem: string;
    impact: string;
  }>;
  questions: Array<{
    question: string;
    guidance: string;
    priority: "high" | "medium" | "low";
  }>;
  nextAction: "continue" | "supplement_notes" | "rebuild_source_bundle";
}

export interface CreateDramaProjectPayload {
  title: string;
  source: DramaSourceType;
  sourceRef?: string;
  track?: string;
  theme?: string;
  targetEpisodes?: number;
  inspiration?: string;
  rawText?: string;
}

export interface DramaProject {
  id: string;
  title: string;
  source: DramaSourceType;
  sourceRef?: string | null;
  sourceInput?: string | null;
  track?: string | null;
  theme?: string | null;
  orientation: string;
  targetEpisodes: number;
  strategy?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DramaEpisode {
  id: string;
  projectId: string;
  order: number;
  title: string;
  content?: string | null;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  hookType?: string | null;
  isPaywall: boolean;
  emotionNet?: number | null;
  beatSheet?: string | null;
  sourceMap?: string | null;
  durationSec?: number | null;
  status: string;
  qualityFlags?: string | null;
  storyboards?: DramaStoryboard[];
  videoPrompts?: DramaVideoPrompt[];
}

export interface DramaSourceBundle {
  id: string;
  projectId: string;
  synopsis?: string | null;
  beats?: string | null;
  worldNotes?: string | null;
  hardFacts?: string | null;
  rawText?: string | null;
}

export interface DramaCharacter {
  id: string;
  projectId?: string;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  speechStyle?: string | null;
  visualAnchor?: string | null;
  voiceProfile?: string | null;
  relations?: string | null;
}

export interface DramaCharacterLibraryItem {
  id: string;
  projectId?: string | null;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  speechStyle?: string | null;
  visualAnchor?: string | null;
  voiceProfile?: string | null;
  relations?: string | null;
  tags?: string | null;
}

export interface DramaShot {
  id: string;
  storyboardId: string;
  order: number;
  shotSize?: string | null;
  cameraMove?: string | null;
  durationSec?: number | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  visualPrompt?: string | null;
}

export interface DramaStoryboard {
  id: string;
  projectId: string;
  episodeId: string;
  version: number;
  status: string;
  summary?: string | null;
  shots?: DramaShot[];
}

export interface DramaVideoPrompt {
  id: string;
  projectId: string;
  episodeId?: string | null;
  shotId?: string | null;
  provider: string;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  durationSec?: number | null;
  status: string;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  failureReason?: string | null;
  providerResult?: string | null;
}

export interface DramaVideoProvider {
  provider: string;
  label: string;
  description?: string;
}

export type DramaProjectDetail = DramaProject & {
  sourceBundle?: DramaSourceBundle | null;
  characters?: DramaCharacter[];
  episodes?: DramaEpisode[];
  videoPrompts?: DramaVideoPrompt[];
}

export async function listDramaProjects() {
  const { data } = await apiClient.get<ApiResponse<DramaProject[]>>("/drama/projects");
  return data;
}

export async function createDramaProject(payload: CreateDramaProjectPayload) {
  const { data } = await apiClient.post<ApiResponse<DramaProject>>("/drama/projects", payload);
  return data;
}

export async function getDramaProject(id: string) {
  const { data } = await apiClient.get<ApiResponse<DramaProjectDetail>>(`/drama/projects/${id}`);
  return data;
}

export async function assembleDramaSourceBundle(id: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/source-bundle`, {});
  return data;
}

export async function recommendDramaTrack(payload: {
  title: string;
  sourceType: DramaSourceType;
  sourceDigest?: string;
  theme?: string;
  targetEpisodes?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<DramaTrackRecommendation>>("/drama/track-recommendation", payload);
  return data;
}

export async function analyzeDramaSourceSupplement(id: string, payload: DramaLLMOptions & {
  userSupplement?: string;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<DramaSourceSupplementGuidance>>(
    `/drama/projects/${id}/source-supplement`,
    payload,
  );
  return data;
}

export async function generateDramaStrategy(id: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/strategy`, payload);
  return data;
}

export async function generateDramaOutline(id: string, payload: DramaLLMOptions & {
  startOrder?: number;
  count?: number;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/outline`, payload);
  return data;
}

export async function generateDramaEpisodeScript(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/script`, payload);
  return data;
}

export async function updateDramaEpisode(id: string, order: number, payload: {
  title?: string;
  content?: string;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  durationSec?: number | null;
}) {
  const { data } = await apiClient.patch<ApiResponse<DramaEpisode>>(`/drama/projects/${id}/episodes/${order}`, payload);
  return data;
}

export async function reviewDramaEpisode(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/review`, payload);
  return data;
}

export async function repairDramaEpisode(id: string, order: number, payload: DramaLLMOptions & {
  instruction?: string;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/repair`, payload);
  return data;
}

export async function listDramaCharacters(id: string) {
  const { data } = await apiClient.get<ApiResponse<unknown[]>>(`/drama/projects/${id}/characters`);
  return data;
}

export async function updateDramaCharacter(id: string, characterId: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch<ApiResponse<unknown>>(`/drama/projects/${id}/characters/${characterId}`, payload);
  return data;
}

export async function saveDramaCharacterToLibrary(id: string, characterId: string, tags?: string[]) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `/drama/projects/${id}/characters/${characterId}/save-to-library`,
    { tags },
  );
  return data;
}

export async function listDramaCharacterLibrary(projectId?: string) {
  const { data } = await apiClient.get<ApiResponse<DramaCharacterLibraryItem[]>>("/drama/character-library", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function importDramaCharacterFromLibrary(id: string, libraryId: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/character-library/import`, {
    libraryId,
  });
  return data;
}

export async function generateDramaStoryboard(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/storyboard`, payload);
  return data;
}

export async function getDramaStoryboard(storyboardId: string) {
  const { data } = await apiClient.get<ApiResponse<unknown>>(`/drama/storyboards/${storyboardId}`);
  return data;
}

export async function listDramaVideoProviders() {
  const { data } = await apiClient.get<ApiResponse<DramaVideoProvider[]>>("/drama/video-providers");
  return data;
}

export async function generateDramaVideoPrompt(id: string, shotId: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/shots/${shotId}/video-prompt`, payload);
  return data;
}

export async function createDramaVideoProviderTask(videoPromptId: string, provider = "mock") {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/video-prompts/${videoPromptId}/provider-task`, {
    provider,
  });
  return data;
}

export async function refreshDramaVideoProviderTask(videoPromptId: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/video-prompts/${videoPromptId}/provider-task/refresh`, {});
  return data;
}

export async function downloadDramaExport(id: string, format: "markdown" | "json") {
  const response = await apiClient.get<Blob>(`/drama/projects/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}
