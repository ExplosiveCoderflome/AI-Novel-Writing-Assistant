import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComicSourceType = "novel_import" | "original" | "text_import" | "comic_import";

export interface ComicProject {
  id: string;
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string | null;
  sourceInput?: string | null;
  trackId?: string | null;
  stylePreset?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceBundle?: { id: string; importedAt: string } | null;
  _count?: { episodes: number; characters: number };
}

export interface ComicProjectDetail extends ComicProject {
  characters: ComicCharacter[];
  episodes: ComicEpisode[];
  batchJobs: ComicBatchJob[];
}

export interface ComicCharacter {
  id: string;
  projectId: string;
  name: string;
  persona?: string | null;
  visualAnchor?: string | null;
  sheetData?: string | null;
  sourceCharacterRef?: string | null;
  createdAt: string;
}

export interface ComicEpisode {
  id: string;
  projectId: string;
  order: number;
  title: string | null;
  hookType?: string | null;
  cliffhanger?: string | null;
  isPaywalled: boolean;
  outline?: string | null;
  sourceText?: string | null;
  status: string;
  _count?: { panels: number };
  panels?: ComicPanel[];
}

export interface ComicDialogue {
  speaker: string;
  text: string;
  bubbleType: "round" | "spike" | "cloud" | "caption";
  anchorHint?: string;
}

export interface ComicPanelCharacterRef {
  name: string;
  costume?: "default" | "combat" | "formal" | "casual";
  expression?: "neutral" | "happy" | "angry" | "sad" | "surprised" | "cold";
  lighting?: string;
}

export interface ComicPanel {
  id: string;
  episodeId: string;
  order: number;
  panelType: "establishing" | "close_up" | "action" | "reaction" | "transition";
  action: string;
  dialogues: string | null; // JSON string of ComicDialogue[]
  characterRefs: string | null; // JSON string of string[] or ComicPanelCharacterRef[]
  visualPrompt: string;
  imageData: string | null; // JSON of PanelImageData
  letteredData: string | null; // JSON
  motionData: string | null; // JSON
}

export interface PanelImageData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
}

export interface ComicExportJob {
  id: string;
  projectId: string;
  episodeId?: string | null;
  format: string;
  spec?: string | null;
  status: string;
  artifacts?: string | null;
  createdAt: string;
}

export interface ComicBatchJob {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: string;
  createdAt: string;
}

export interface CreateComicProjectPayload {
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string;
  trackId?: string;
  inspiration?: string;
  rawText?: string;
  comicFormat?: string;
  stylePreset?: string;
}

export interface GenerateOutlinePayload {
  startOrder?: number;
  count?: number;
  provider?: string;
}

export interface GenerateScriptPayload {
  targetPanelCount?: number;
  refreshSourceText?: boolean;
  provider?: string;
}

export interface ExportEpisodePayload {
  format?: "long_image" | "sliced";
  spec?: {
    sliceWidth?: number;
    sliceMaxHeight?: number;
    outputFormat?: "png" | "jpg" | "webp";
    quality?: number;
  };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listComicProjects(): Promise<ComicProject[]> {
  const res = await apiClient.get<ApiResponse<ComicProject[]>>("/comic/projects");
  return res.data.data!;
}

export async function createComicProject(payload: CreateComicProjectPayload): Promise<ComicProject> {
  const res = await apiClient.post<ApiResponse<ComicProject>>("/comic/projects", payload);
  return res.data.data!;
}

export async function getComicProject(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.get<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}`);
  return res.data.data!;
}

export async function deleteComicProject(projectId: string): Promise<void> {
  await apiClient.delete(`/comic/projects/${projectId}`);
}

export async function importComicSourceBundle(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.post<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}/source-bundle`);
  return res.data.data!;
}

export async function updateComicStyle(projectId: string, style: string): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/style`, { style });
  return res.data.data!;
}

export interface UpdateComicPresetPayload {
  format?: string;
  style?: string;
  promptKeywords?: string;
  imageSize?: string;
}

export async function updateComicPreset(projectId: string, payload: UpdateComicPresetPayload): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/preset`, payload);
  return res.data.data!;
}

// ─── Characters ───────────────────────────────────────────────────────────────

export interface CharacterSheetData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  assets?: {
    expression?: CharacterExpressionData;
  };
}

export interface CharacterExpressionData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
}

export interface GenerateCharacterSheetOptions {
  prompt?: string;
  useCurrentImageAsReference?: boolean;
}

export function characterSheetImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/sheet`;
}

export function characterExpressionImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/expression`;
}

export function characterFaceImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/face`;
}

export async function generateCharacterSheet(
  charId: string,
  provider?: string,
  options?: GenerateCharacterSheetOptions,
): Promise<CharacterSheetData> {
  const res = await apiClient.post<ApiResponse<CharacterSheetData>>(
    `/comic/characters/${charId}/sheet/generate`,
    { ...(provider ? { provider } : {}), ...(options ?? {}) },
  );
  return res.data.data!;
}

export async function getCharacterSheetData(charId: string): Promise<CharacterSheetData> {
  const res = await apiClient.get<ApiResponse<CharacterSheetData>>(`/comic/characters/${charId}/sheet`);
  return res.data.data!;
}

export async function generateCharacterExpressionSheet(charId: string, provider?: string): Promise<CharacterExpressionData> {
  const res = await apiClient.post<ApiResponse<CharacterExpressionData>>(
    `/comic/characters/${charId}/expression/generate`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function getCharacterExpressionData(charId: string): Promise<CharacterExpressionData> {
  const res = await apiClient.get<ApiResponse<CharacterExpressionData>>(`/comic/characters/${charId}/expression`);
  return res.data.data!;
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function listComicEpisodes(projectId: string): Promise<ComicEpisode[]> {
  const res = await apiClient.get<ApiResponse<ComicEpisode[]>>(`/comic/projects/${projectId}/episodes`);
  return res.data.data!;
}

export async function generateComicOutline(projectId: string, payload?: GenerateOutlinePayload): Promise<ComicEpisode[]> {
  const res = await apiClient.post<ApiResponse<ComicEpisode[]>>(
    `/comic/projects/${projectId}/episodes/generate-outline`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function getComicEpisode(episodeId: string): Promise<ComicEpisode> {
  const res = await apiClient.get<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`);
  return res.data.data!;
}

export async function updateEpisodeSourceText(episodeId: string, sourceText: string): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}/source-text`, { sourceText });
  return res.data.data!;
}

// ─── Panels ───────────────────────────────────────────────────────────────────

export async function listComicPanels(episodeId: string): Promise<ComicPanel[]> {
  const res = await apiClient.get<ApiResponse<ComicPanel[]>>(`/comic/episodes/${episodeId}/panels`);
  return res.data.data!;
}

export async function generateComicPanelScript(episodeId: string, payload?: GenerateScriptPayload): Promise<ComicEpisode> {
  const res = await apiClient.post<ApiResponse<ComicEpisode>>(
    `/comic/episodes/${episodeId}/generate-script`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function getComicPanel(panelId: string): Promise<ComicPanel> {
  const res = await apiClient.get<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}`);
  return res.data.data!;
}

export async function updatePanelVisualPrompt(panelId: string, visualPrompt: string): Promise<ComicPanel> {
  const res = await apiClient.patch<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}/visual-prompt`, { visualPrompt });
  return res.data.data!;
}

// ─── Panel images ─────────────────────────────────────────────────────────────

export async function generatePanelImage(panelId: string, provider?: string): Promise<PanelImageData> {
  const res = await apiClient.post<ApiResponse<PanelImageData>>(
    `/comic/panels/${panelId}/image/generate`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export function panelImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/panel`;
}

export function panelLetteredImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/lettered`;
}

// ─── Bubble lettering ─────────────────────────────────────────────────────────

export async function letterPanel(
  panelId: string,
  opts?: { bubbleOpacity?: number; maxBubbleWidthRatio?: number },
): Promise<{ url: string; width: number; height: number }> {
  const res = await apiClient.post<ApiResponse<{ url: string; width: number; height: number }>>(
    `/comic/panels/${panelId}/letter`,
    opts ?? {},
  );
  return res.data.data!;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportComicEpisode(
  episodeId: string,
  payload?: ExportEpisodePayload,
): Promise<{ jobId: string; artifacts: Array<{ index?: number; url: string; width: number; height: number }> }> {
  const res = await apiClient.post(`/comic/episodes/${episodeId}/export`, payload ?? {});
  return (res.data as ApiResponse<unknown>).data as ReturnType<typeof exportComicEpisode> extends Promise<infer T> ? T : never;
}

export async function listExportJobs(projectId: string): Promise<ComicExportJob[]> {
  const res = await apiClient.get<ApiResponse<ComicExportJob[]>>(`/comic/projects/${projectId}/export-jobs`);
  return res.data.data!;
}
