import type {
  BookAnalysis,
  BookAnalysisBudgetUpdateInput,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisResumeWithBudgetInput,
  BookAnalysisSectionOptimizePreview,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterAppearance,
  BookAnalysisCharacterAppearanceMergeResult,
  BookAnalysisCharacterAppearanceScanJob,
  BookAnalysisCharacterAppearanceTerm,
  BookAnalysisCharacterAppearanceTermStatus,
  BookAnalysisCharacterBatchGenerateInput,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
  BookAnalysisCharacterIdentifyInput,
  BookAnalysisCharacterProfileGenerateInput,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "./comic";

export async function listBookAnalyses(params?: {
  keyword?: string;
  status?: BookAnalysisStatus;
  documentId?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysis[]>>("/book-analysis", {
    params,
  });
  return data;
}

export async function getBookAnalysis(id: string) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}`);
  return data;
}

export async function createBookAnalysis(payload: {
  documentId: string;
  versionId?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  budgetTokens?: number | null;
  userFocusInstruction?: string;
  sourceRange?: { startChapterIndex: number; endChapterIndex: number } | null;
  includeTimeline?: boolean;
  enabledSectionKeys?: BookAnalysisSectionKey[];
}) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>("/book-analysis", payload);
  return data;
}

export async function rebuildBookAnalysis(id: string) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}/rebuild`, {});
  return data;
}

export async function updateBookAnalysisBudget(id: string, payload: BookAnalysisBudgetUpdateInput) {
  const { data } = await apiClient.patch<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}/budget`, payload);
  return data;
}

export async function resumeBookAnalysisWithBudget(id: string, payload: BookAnalysisResumeWithBudgetInput) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(
    `/book-analysis/${id}/resume-with-budget`,
    payload,
  );
  return data;
}

export async function copyBookAnalysis(id: string) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}/copy`, {});
  return data;
}

export async function publishBookAnalysis(id: string, payload: { novelId: string }) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisPublishResult>>(
    `/book-analysis/${id}/publish`,
    payload,
  );
  return data;
}

export async function regenerateBookAnalysisSection(
  id: string,
  sectionKey: BookAnalysisSectionKey,
  payload: { focusInstruction?: string | null } = {},
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(
    `/book-analysis/${id}/sections/${sectionKey}/regenerate`,
    payload,
  );
  return data;
}

export async function optimizeBookAnalysisSectionPreview(
  id: string,
  sectionKey: BookAnalysisSectionKey,
  payload: { currentDraft: string; instruction: string },
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisSectionOptimizePreview>>(
    `/book-analysis/${id}/sections/${sectionKey}/optimize-preview`,
    payload,
  );
  return data;
}

export async function updateBookAnalysisSection(
  id: string,
  sectionKey: BookAnalysisSectionKey,
  payload: {
    editedContent?: string | null;
    notes?: string | null;
    focusInstruction?: string | null;
    frozen?: boolean;
  },
) {
  const { data } = await apiClient.patch<ApiResponse<BookAnalysisDetail>>(
    `/book-analysis/${id}/sections/${sectionKey}`,
    payload,
  );
  return data;
}

export async function archiveBookAnalysis(id: string) {
  const { data } = await apiClient.patch<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}`, {
    status: "archived",
  });
  return data;
}

export async function listBookAnalysisCharacters(id: string) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysisCharacter[]>>(`/book-analysis/${id}/characters`);
  return data;
}

export async function createBookAnalysisCharacter(
  id: string,
  payload: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  },
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacter>>(`/book-analysis/${id}/characters`, payload);
  return data;
}

export async function generateBookAnalysisCharacters(
  id: string,
  payload: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    characterNames?: string[];
  },
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacter[]>>(
    `/book-analysis/${id}/characters/generate`,
    payload,
  );
  return data;
}

export async function identifyBookAnalysisCharacterCandidates(
  id: string,
  payload: BookAnalysisCharacterIdentifyInput = {},
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacter[]>>(
    `/book-analysis/${id}/characters/identify`,
    payload,
  );
  return data;
}

export async function generateBookAnalysisCharacterProfile(
  id: string,
  characterId: string,
  payload: BookAnalysisCharacterProfileGenerateInput,
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacter>>(
    `/book-analysis/${id}/characters/${characterId}/generate-profile`,
    payload,
  );
  return data;
}

export async function generateAllBookAnalysisCharacterCandidates(
  id: string,
  payload: BookAnalysisCharacterBatchGenerateInput,
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacter[]>>(
    `/book-analysis/${id}/characters/generate-candidates`,
    payload,
  );
  return data;
}

export async function updateBookAnalysisCharacter(
  id: string,
  characterId: string,
  payload: {
    name?: string;
    role?: string;
    profile?: Partial<CharacterProfile>;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  },
) {
  const { data } = await apiClient.patch<ApiResponse<BookAnalysisCharacter>>(
    `/book-analysis/${id}/characters/${characterId}`,
    payload,
  );
  return data;
}

export async function deleteBookAnalysisCharacter(id: string, characterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/book-analysis/${id}/characters/${characterId}`);
  return data;
}

export async function prepareBookAnalysisCharacterImage(
  id: string,
  characterId: string,
  payload: { provider?: LLMProvider } = {},
) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/book-analysis/${id}/characters/${characterId}/images/prepare`,
    payload,
  );
  return data;
}

export async function generateBookAnalysisCharacterImage(
  id: string,
  characterId: string,
  payload: {
    provider?: LLMProvider;
    count?: number;
    stylePreset?: string;
    overrides?: ImageGenerationOverrides;
  } = {},
) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationTask>>(
    `/book-analysis/${id}/characters/${characterId}/images/generate`,
    {
      provider: payload.provider,
      count: payload.count,
      stylePreset: payload.stylePreset,
      promptOverride: payload.overrides?.promptOverride,
      negativePromptOverride: payload.overrides?.negativePromptOverride,
      providerOverride: payload.overrides?.providerOverride,
      sizeOverride: payload.overrides?.sizeOverride,
    },
  );
  return data;
}

export async function listBookAnalysisCharacterImages(id: string, characterId: string) {
  const { data } = await apiClient.get<ApiResponse<ImageAsset[]>>(
    `/book-analysis/${id}/characters/${characterId}/images`,
  );
  return data;
}

export async function setPrimaryBookAnalysisCharacterImage(id: string, characterId: string, assetId: string) {
  const { data } = await apiClient.patch<ApiResponse<ImageAsset>>(
    `/book-analysis/${id}/characters/${characterId}/images/${assetId}`,
    {},
  );
  return data;
}

export async function deleteBookAnalysisCharacterImage(id: string, characterId: string, assetId: string) {
  const { data } = await apiClient.delete<ApiResponse<ImageAsset>>(
    `/book-analysis/${id}/characters/${characterId}/images/${assetId}`,
  );
  return data;
}

export async function promoteBookAnalysisCharacter(
  id: string,
  characterId: string,
  payload: { includePrimaryImage?: boolean },
) {
  const { data } = await apiClient.post<ApiResponse<{
    baseCharacter: BaseCharacter;
    clonedPrimaryImageAsset: ImageAsset | null;
  }>>(`/book-analysis/${id}/characters/${characterId}/promote`, payload);
  return data;
}

export async function getBookAnalysisCharacterAppearance(id: string, characterId: string) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysisCharacterAppearance | null>>(
    `/book-analysis/${id}/characters/${characterId}/appearance`,
  );
  return data;
}

export async function listBookAnalysisCharacterAppearanceTerms(
  id: string,
  characterId: string,
  status?: BookAnalysisCharacterAppearanceTermStatus,
) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysisCharacterAppearanceTerm[]>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/terms`,
    { params: status ? { status } : undefined },
  );
  return data;
}

export async function mergeBookAnalysisCharacterAppearanceTerms(
  id: string,
  characterId: string,
  payload: { termIds: string[] },
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacterAppearanceMergeResult>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/terms/merge`,
    payload,
  );
  return data;
}

export async function updateBookAnalysisCharacterAppearanceTerm(
  id: string,
  characterId: string,
  termId: string,
  payload: { status: Exclude<BookAnalysisCharacterAppearanceTermStatus, "merged"> },
) {
  const { data } = await apiClient.patch<ApiResponse<BookAnalysisCharacterAppearanceTerm>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/terms/${termId}`,
    payload,
  );
  return data;
}

export async function scanBookAnalysisCharacterAppearance(
  id: string,
  characterId: string,
  payload: { targetPercent: number },
) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisCharacterAppearanceScanJob>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/scan`,
    payload,
  );
  return data;
}

export async function getBookAnalysisCharacterAppearanceScanJob(
  id: string,
  characterId: string,
  jobId: string,
) {
  const { data } = await apiClient.get<ApiResponse<BookAnalysisCharacterAppearanceScanJob>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/scan-jobs/${jobId}`,
  );
  return data;
}

export async function prepareBookAnalysisCharacterAppearanceImage(
  id: string,
  characterId: string,
  snapshotId: string,
  payload: { provider?: LLMProvider; referenceImageAssetIds?: string[] } = {},
) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/snapshots/${snapshotId}/images/prepare`,
    payload,
  );
  return data;
}

export async function generateBookAnalysisCharacterAppearanceImage(
  id: string,
  characterId: string,
  snapshotId: string,
  payload: {
    provider?: LLMProvider;
    count?: number;
    stylePreset?: string;
    referenceImageAssetIds?: string[];
    overrides?: ImageGenerationOverrides;
  } = {},
) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationTask>>(
    `/book-analysis/${id}/characters/${characterId}/appearance/snapshots/${snapshotId}/images/generate`,
    {
      provider: payload.provider,
      count: payload.count,
      stylePreset: payload.stylePreset,
      referenceImageAssetIds: payload.referenceImageAssetIds,
      promptOverride: payload.overrides?.promptOverride,
      negativePromptOverride: payload.overrides?.negativePromptOverride,
      providerOverride: payload.overrides?.providerOverride,
      sizeOverride: payload.overrides?.sizeOverride,
      excludedReferenceImageUrls: payload.overrides?.excludedReferenceImageUrls,
    },
  );
  return data;
}

function extractFileName(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (!match?.[1]) {
    return fallback;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function downloadBookAnalysisExport(id: string, format: "markdown" | "json") {
  const response = await apiClient.get<Blob>(`/book-analysis/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  const fallback = format === "json" ? `book-analysis-${id}.json` : `book-analysis-${id}.md`;
  return {
    blob: response.data,
    fileName: extractFileName(response.headers["content-disposition"], fallback),
  };
}
