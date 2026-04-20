import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelExportFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import type { NovelCreateResourceRecommendation } from "@ai-novel/shared/types/novelResourceRecommendation";
import type {
  AIFreedom,
  Chapter,
  ChapterSummary,
  EmotionIntensity,
  NarrativePov,
  Novel,
  PacePreference,
  ProjectMode,
  ProjectProgressStatus,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";
import {
  buildNovelExportFallbackFileName,
  extractFileName,
  type NovelDetailResponse,
  type NovelListResponse,
  normalizeNovelListLimit,
} from "./shared";

export async function getNovelList(params?: { page?: number; limit?: number }) {
  const { data } = await apiClient.get<ApiResponse<NovelListResponse>>("/novels", {
    params: {
      page: params?.page ?? 1,
      limit: normalizeNovelListLimit(params?.limit),
    },
  });
  return data;
}

export async function getNovelDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelDetailResponse>>(`/novels/${id}`);
  return data;
}

export async function createNovel(payload: {
  title: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
  genreId?: string;
  primaryStoryModeId?: string;
  secondaryStoryModeId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  projectMode?: ProjectMode;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  defaultChapterLength?: number;
  estimatedChapterCount?: number;
  projectStatus?: ProjectProgressStatus;
  storylineStatus?: ProjectProgressStatus;
  outlineStatus?: ProjectProgressStatus;
  resourceReadyScore?: number;
  sourceNovelId?: string;
  sourceKnowledgeDocumentId?: string;
  continuationBookAnalysisId?: string;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[];
}) {
  const { data } = await apiClient.post<ApiResponse<Novel>>("/novels", payload);
  return data;
}

export async function recommendNovelCreateResources(payload: {
  title?: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
  genreId?: string;
  primaryStoryModeId?: string;
  secondaryStoryModeId?: string;
  writingMode?: "original" | "continuation";
  projectMode?: ProjectMode;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<NovelCreateResourceRecommendation>>(
    "/novels/resource-recommendation",
    payload,
  );
  return data;
}

export async function updateNovel(
  id: string,
  payload: Partial<{
    title: string;
    description: string;
    targetAudience: string | null;
    bookSellingPoint: string | null;
    competingFeel: string | null;
    first30ChapterPromise: string | null;
    commercialTags: string[] | null;
    status: "draft" | "published";
    writingMode: "original" | "continuation";
    projectMode: ProjectMode | null;
    narrativePov: NarrativePov | null;
    pacePreference: PacePreference | null;
    styleTone: string | null;
    emotionIntensity: EmotionIntensity | null;
    aiFreedom: AIFreedom | null;
    defaultChapterLength: number | null;
    estimatedChapterCount: number | null;
    projectStatus: ProjectProgressStatus | null;
    storylineStatus: ProjectProgressStatus | null;
    outlineStatus: ProjectProgressStatus | null;
    resourceReadyScore: number | null;
    sourceNovelId: string | null;
    sourceKnowledgeDocumentId: string | null;
    continuationBookAnalysisId: string | null;
    continuationBookAnalysisSections: BookAnalysisSectionKey[] | null;
    genreId: string | null;
    primaryStoryModeId: string | null;
    secondaryStoryModeId: string | null;
    worldId: string | null;
    outline: string | null;
    structuredOutline: string | null;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Novel>>(`/novels/${id}`, payload);
  return data;
}

export async function deleteNovel(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}`);
  return data;
}

export async function generateNovelTitles(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    count?: number;
    maxTokens?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      titles: TitleFactorySuggestion[];
    }>
  >(`/novels/${id}/title/generate`, payload ?? {});
  return data;
}

export async function listNovelChapterSummaries(id: string) {
  const detail = await getNovelDetail(id);
  const chapters = detail.data?.chapters ?? [];
  const summaries: ChapterSummary[] = chapters
    .map((chapter) => (chapter as Chapter & { chapterSummary?: ChapterSummary | null }).chapterSummary)
    .filter((item): item is ChapterSummary => Boolean(item));
  return summaries;
}

export async function downloadNovelExport(
  id: string,
  format: NovelExportFormat = "txt",
  scope: NovelExportScope = "full",
  novelTitle?: string,
) {
  const response = await apiClient.get<Blob>(`/novels/${id}/export`, {
    params: { format, scope },
    responseType: "blob",
  });
  const fallback = buildNovelExportFallbackFileName(novelTitle || id, format, scope);
  return {
    blob: response.data,
    fileName: extractFileName(response.headers["content-disposition"], fallback),
  };
}
