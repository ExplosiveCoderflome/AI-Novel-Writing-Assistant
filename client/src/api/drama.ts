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

export interface DramaCharacterPortraitData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: DramaGenerationHistoryItem[];
}

export interface DramaCharacterThreeViewItem {
  view: "front" | "side" | "back";
  status: "idle" | "generating" | "done" | "error";
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
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
  /** JSON 字符串，解析为 DramaCharacterPortraitData */
  portraitData?: string | null;
  /** JSON 字符串，解析为 DramaCharacterThreeViewItem[] */
  threeViewData?: string | null;
}

export interface DramaGenerationHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface DramaShotKeyframeData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: DramaGenerationHistoryItem[];
}

export interface DramaDialogueAudioItem {
  lineIndex: number;
  speaker?: string;
  text: string;
  voiceId?: string;
  audioUrl: string;
  durationSec?: number;
  provider: string;
}

export interface DramaDialogueAudioData {
  status: "idle" | "generating" | "done" | "error";
  provider?: string;
  items?: DramaDialogueAudioItem[];
  generatedAt?: string;
  error?: string;
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
  keyframeData?: string | null;
  dialogueAudioData?: string | null;
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
  version?: number;
  supersededById?: string | null;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  failureReason?: string | null;
  providerResult?: string | null;
}

export interface DramaVideoProvider {
  provider: string;
  label: string;
  description?: string;
  supportsRefImages: boolean;
  costPerSecond?: number;
  currency?: string;
}

export interface DramaTTSProvider {
  provider: string;
  label: string;
  description?: string;
  costPerSecond?: number;
  currency?: string;
}

export type DramaBatchJobType = "keyframes" | "videos" | "tts";

export interface DramaBatchProgress {
  total: number;
  done: number;
  failed: number;
  skipped?: number;
  failedShotIds: string[];
  provider?: string;
  targetShotIds?: string[];
  currentShotId?: string;
  errors?: Array<{ shotId: string; message: string }>;
  useCharacterRefImages?: boolean;
  cost?: DramaBatchCostBreakdown;
}

export interface DramaBatchCostUnits {
  images?: number;
  seconds?: number;
  shots?: number;
  lines?: number;
}

export interface DramaBatchCostBreakdown {
  currency: string;
  estimated: number;
  actual: number;
  estimatedUnits: DramaBatchCostUnits;
  actualUnits: DramaBatchCostUnits;
  unit: {
    costPerImage?: number;
    costPerSecond?: number;
  };
}

export interface DramaBatchEstimate {
  type: DramaBatchJobType;
  provider: string;
  total: number;
  targetShotIds: string[];
  cost: DramaBatchCostBreakdown;
}

export interface DramaBatchJob {
  id: string;
  projectId: string;
  episodeId?: string | null;
  type: DramaBatchJobType;
  status: "pending" | "running" | "paused" | "done" | "failed";
  progress: string;
  createdAt: string;
  updatedAt: string;
}

export interface DramaComplianceReport {
  level: "pass" | "warn" | "block";
  items: Array<{
    rule: string;
    excerpt: string;
    suggestion: string;
  }>;
}

export interface DramaComplianceBatchResult {
  checked: number;
  pass: number;
  warn: number;
  block: number;
  results: Array<{
    episodeOrder: number;
    title: string;
    level: DramaComplianceReport["level"];
    itemCount: number;
  }>;
}

export type DramaProjectDetail = DramaProject & {
  sourceBundle?: DramaSourceBundle | null;
  characters?: DramaCharacter[];
  episodes?: DramaEpisode[];
  videoPrompts?: DramaVideoPrompt[];
  batchJobs?: DramaBatchJob[];
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

export async function checkDramaEpisodeCompliance(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<DramaComplianceReport>>(
    `/drama/projects/${id}/episodes/${order}/compliance`,
    payload,
  );
  return data;
}

export async function checkDramaProjectCompliance(id: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<DramaComplianceBatchResult>>(
    `/drama/projects/${id}/compliance`,
    payload,
  );
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

export async function listDramaTTSProviders() {
  const { data } = await apiClient.get<ApiResponse<DramaTTSProvider[]>>("/drama/tts-providers");
  return data;
}

export async function generateDramaVideoPrompt(id: string, shotId: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/shots/${shotId}/video-prompt`, payload);
  return data;
}

export async function generateDramaShotKeyframe(
  id: string,
  shotId: string,
  provider?: string,
  useCharacterRefImages?: boolean,
) {
  const { data } = await apiClient.post<ApiResponse<DramaShotKeyframeData>>(
    `/drama/projects/${id}/shots/${shotId}/keyframe`,
    { ...(provider ? { provider } : {}), ...(useCharacterRefImages ? { useCharacterRefImages } : {}) },
  );
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

export async function createDramaEpisodeBatchJob(id: string, order: number, payload: {
  type: DramaBatchJobType;
  provider?: string;
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<DramaBatchJob>>(
    `/drama/projects/${id}/episodes/${order}/batch-jobs`,
    payload,
  );
  return data;
}

export async function estimateDramaEpisodeBatchJob(id: string, order: number, payload: {
  type: DramaBatchJobType;
  provider?: string;
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<DramaBatchEstimate>>(
    `/drama/projects/${id}/episodes/${order}/batch-jobs/estimate`,
    payload,
  );
  return data;
}

export async function downloadDramaExport(id: string, format: "markdown" | "json") {
  const response = await apiClient.get<Blob>(`/drama/projects/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}

export type DramaEpisodeExportFormat = "srt" | "timeline-json";

export async function downloadDramaEpisodeExport(id: string, order: number, format: DramaEpisodeExportFormat) {
  const response = await apiClient.get<Blob>(`/drama/projects/${id}/episodes/${order}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 角色图片生成
// ─────────────────────────────────────────────────────────────────────────────

export async function getDramaCharacterImageStatus(id: string, characterId: string) {
  const { data } = await apiClient.get<ApiResponse<{ portrait: DramaCharacterPortraitData; threeView: DramaCharacterThreeViewItem[] }>>(
    `/drama/projects/${id}/characters/${characterId}/image-status`,
  );
  return data;
}

/** 生成角色设计稿（面部特写 + 三视图合图，推荐使用） */
export async function generateDramaCharacterSheet(id: string, characterId: string, provider?: string) {
  const { data } = await apiClient.post<ApiResponse<DramaCharacterPortraitData>>(
    `/drama/projects/${id}/characters/${characterId}/generate-character-sheet`,
    provider ? { provider } : {},
  );
  return data;
}

/** @deprecated 使用 generateDramaCharacterSheet 替代 */
export async function generateDramaCharacterPortrait(id: string, characterId: string, provider?: string) {
  return generateDramaCharacterSheet(id, characterId, provider);
}

export async function generateDramaCharacterThreeView(id: string, characterId: string, provider?: string) {
  const { data } = await apiClient.post<ApiResponse<DramaCharacterThreeViewItem[]>>(
    `/drama/projects/${id}/characters/${characterId}/generate-three-view`,
    provider ? { provider } : {},
  );
  return data;
}
