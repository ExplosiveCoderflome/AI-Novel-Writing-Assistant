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
  scriptConfig?: string | null; // JSON of script generation settings
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
  densityLevel?: "low" | "medium" | "high" | null;
  focus?: string | null;
  dialogues: string | null; // JSON string of ComicDialogue[]
  characterRefs: string | null; // JSON string of string[] or ComicPanelCharacterRef[]
  visualPrompt: string;
  layoutData: string | null; // JSON
  imageData: string | null; // JSON of PanelImageData
  letteredData: string | null; // JSON
  motionData: string | null; // JSON
  createdAt?: string;
  updatedAt?: string;
}

export interface PanelReferenceImageMeta {
  kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene";
  label: string;
  url: string;
}

export interface PanelImageData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  referenceImages?: PanelReferenceImageMeta[];
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
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
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
  lockAppearance?: boolean;
  appearanceOverride?: string;
}

export function characterSheetImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/sheet`;
}

export function characterExpressionImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/expressions`;
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
    `/comic/characters/${charId}/expressions/generate`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function getCharacterExpressionData(charId: string): Promise<CharacterExpressionData> {
  const res = await apiClient.get<ApiResponse<CharacterExpressionData>>(`/comic/characters/${charId}/expressions`);
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

export interface UpdateEpisodePayload {
  title?: string;
  outline?: string;
  cliffhanger?: string;
  isPaywalled?: boolean;
}

export async function updateComicEpisode(episodeId: string, payload: UpdateEpisodePayload): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`, payload);
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

// ─── Batch jobs ───────────────────────────────────────────────────────────────

export interface BatchProgress {
  total: number;
  done: number;
  failed: number;
  failedPanelIds: string[];
  status: "running" | "completed" | "partial";
}

export interface StartBatchPayload {
  provider?: string;
  concurrency?: number;
  skipDone?: boolean;
}

export interface BatchCostEstimate {
  totalPanels: number;
  pendingPanels: number;
  estimatedCentsCost: number;
  providerNote: string;
}

export async function startEpisodeBatch(
  episodeId: string,
  payload?: StartBatchPayload,
): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/episodes/${episodeId}/batch/start`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function retryBatchJob(jobId: string, provider?: string): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/batch-jobs/${jobId}/retry`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function getBatchJob(jobId: string): Promise<ComicBatchJob> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob>>(`/comic/batch-jobs/${jobId}`);
  return res.data.data!;
}

export async function listBatchJobs(projectId: string): Promise<ComicBatchJob[]> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob[]>>(`/comic/projects/${projectId}/batch-jobs`);
  return res.data.data!;
}

export async function estimateBatchCost(episodeId: string, provider?: string): Promise<BatchCostEstimate> {
  const params = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const res = await apiClient.get<ApiResponse<BatchCostEstimate>>(
    `/comic/episodes/${episodeId}/batch/estimate${params}`,
  );
  return res.data.data!;
}

// ─── Facts ────────────────────────────────────────────────────────────────────

export type ComicFactCategory = "completed" | "revealed" | "state_changed";

export interface ComicFact {
  id: string;
  projectId: string;
  episodeOrder: number;
  text: string;
  category: ComicFactCategory;
  createdAt: string;
}

export async function listComicFacts(projectId: string): Promise<ComicFact[]> {
  const res = await apiClient.get<ApiResponse<ComicFact[]>>(`/comic/projects/${projectId}/facts`);
  return res.data.data!;
}

export async function deleteComicFact(factId: string): Promise<void> {
  await apiClient.delete(`/comic/facts/${factId}`);
}

// ─── Character Assets ──────────────────────────────────────────────────────────

export type CharacterAssetType = "costume" | "weapon" | "item" | "vehicle" | "ability" | "other";
export type AssetImageStatus = "idle" | "generating" | "done" | "error";

export interface AssetImageData {
  status: AssetImageStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface ComicCharacterAsset {
  id: string;
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description: string | null;
  imageData: string | null; // JSON AssetImageData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetPayload {
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateAssetPayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  assetType?: CharacterAssetType;
}

export async function listCharacterAssets(characterId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/characters/${characterId}/assets`);
  return res.data.data!;
}

export async function listProjectCharacterAssets(projectId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/projects/${projectId}/character-assets`);
  return res.data.data!;
}

export async function createCharacterAsset(payload: CreateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>("/comic/character-assets", payload);
  return res.data.data!;
}

export async function updateCharacterAsset(assetId: string, payload: UpdateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.patch<ApiResponse<ComicCharacterAsset>>(`/comic/character-assets/${assetId}`, payload);
  return res.data.data!;
}

export async function deleteCharacterAsset(assetId: string): Promise<void> {
  await apiClient.delete(`/comic/character-assets/${assetId}`);
}

export async function generateCharacterAssetImage(assetId: string, provider?: string): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>(
    `/comic/character-assets/${assetId}/generate-image`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function uploadCharacterAssetImage(assetId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/character-assets/${assetId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return res.data.data!;
}

export function characterAssetImageUrl(assetId: string): string {
  return `/api/comic/character-assets/${assetId}/image`;
}

export interface UpdateVisualAnchorPayload {
  /** 主外貌描述 */
  appearance?: string;
  /** 脸型强覆盖（FINAL OVERRIDE）；当 appearance 含"锐利/尖锐"等冲突词时用此字段强压脸型 */
  faceShapeOverride?: string;
}

export interface VisualAnchorRewriteResult {
  appearance: string;
  faceShapeOverride?: string;
  rationale: string;
}

export async function rewriteCharacterVisualAnchor(
  charId: string,
  payload: { userInstruction?: string; provider?: string },
): Promise<VisualAnchorRewriteResult> {
  const res = await apiClient.post<ApiResponse<VisualAnchorRewriteResult>>(
    `/comic/characters/${charId}/visual-anchor/rewrite`,
    payload,
  );
  return res.data.data!;
}

/**
 * 更新角色"外貌锚点"（生图源头）。
 * 改一次，三视图/表情稿/资产/格子图后续生成都会读新版（已有图不会自动重绘）。
 */
export async function updateCharacterVisualAnchor(
  charId: string,
  payload: UpdateVisualAnchorPayload,
): Promise<ComicCharacter> {
  const res = await apiClient.patch<ApiResponse<ComicCharacter>>(
    `/comic/characters/${charId}/visual-anchor`,
    payload,
  );
  return res.data.data!;
}

// ─── Scenes ────────────────────────────────────────────────────────────────────

export type SceneType = "interior" | "exterior" | "landscape" | "abstract" | "other";
export type SceneSheetStatus = "idle" | "generating" | "done" | "error";

export interface SceneBible {
  palette?: string;
  keyElements?: string;
  materials?: string;
  ambiance?: string;
  layout?: string;
}

export interface SceneSheetData {
  status: SceneSheetStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface ComicScene {
  id: string;
  projectId: string;
  name: string;
  sceneType: SceneType;
  bible: string | null; // JSON SceneBible
  sheetData: string | null; // JSON SceneSheetData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenePayload {
  projectId: string;
  name: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export interface UpdateScenePayload {
  name?: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export async function listComicScenes(projectId: string): Promise<ComicScene[]> {
  const res = await apiClient.get<ApiResponse<ComicScene[]>>(`/comic/projects/${projectId}/scenes`);
  return res.data.data!;
}

export async function createComicScene(payload: CreateScenePayload): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>("/comic/scenes", payload);
  return res.data.data!;
}

export async function updateComicScene(sceneId: string, payload: UpdateScenePayload): Promise<ComicScene> {
  const res = await apiClient.patch<ApiResponse<ComicScene>>(`/comic/scenes/${sceneId}`, payload);
  return res.data.data!;
}

export async function deleteComicScene(sceneId: string): Promise<void> {
  await apiClient.delete(`/comic/scenes/${sceneId}`);
}

export async function generateComicSceneImage(sceneId: string, provider?: string): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>(
    `/comic/scenes/${sceneId}/generate-image`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function uploadComicSceneImage(sceneId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/scenes/${sceneId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return res.data.data!;
}

export function comicSceneImageUrl(sceneId: string): string {
  return `/api/comic/scenes/${sceneId}/image`;
}
