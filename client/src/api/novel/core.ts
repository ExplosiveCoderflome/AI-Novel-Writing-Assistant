import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { KnowledgeDocumentDetail } from "@ai-novel/shared/types/knowledge";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelExportFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import type { NovelCreateResourceRecommendation } from "@ai-novel/shared/types/novelResourceRecommendation";
import type { WritingPlatform, WritingPlatformRecommendation } from "@ai-novel/shared/types/writingPlatform";
import type {
  AIFreedom,
  Chapter,
  ChapterSummary,
  CreationExperience,
  EmotionIntensity,
  NarrativePov,
  Novel,
  PacePreference,
  ProjectMode,
  ProjectProgressStatus,
  SimpleCreationShelfProjection,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";
import {
  buildNovelExportFallbackFileName,
  extractFileName,
  type NovelDetailResponse,
  type NovelListResponse,
  normalizeNovelListLimit,
} from "./shared";

export async function getNovelList(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: "all" | "draft" | "published";
  narrativeForm?: "all" | "short_story" | "long_novel";
  writingMode?: "all" | "original" | "continuation";
  sort?: "updated" | "created" | "progress";
}) {
  const { data } = await apiClient.get<ApiResponse<NovelListResponse>>("/novels", {
    params: {
      page: params?.page ?? 1,
      limit: normalizeNovelListLimit(params?.limit),
      search: params?.search || undefined,
      status: params?.status && params.status !== "all" ? params.status : undefined,
      narrativeForm: params?.narrativeForm && params.narrativeForm !== "all" ? params.narrativeForm : undefined,
      writingMode: params?.writingMode && params.writingMode !== "all" ? params.writingMode : undefined,
      sort: params?.sort ?? "updated",
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
  creationExperience?: CreationExperience;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  postGenerationStyleReviewEnabled?: boolean;
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

export async function setNovelCreationExperience(id: string, experience: CreationExperience) {
  const { data } = await apiClient.post<ApiResponse<Novel>>(`/novels/${id}/creation-experience/${experience}`);
  return data;
}

export const convertNovelToProfessional = (id: string) => setNovelCreationExperience(id, "professional");

export async function getSimpleCreationShelf(id: string) {
  const { data } = await apiClient.get<ApiResponse<SimpleCreationShelfProjection>>(`/novels/${id}/simple-shelf`);
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
    postGenerationStyleReviewEnabled: boolean;
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

export async function exportNovelAsKnowledgeDocument(id: string) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeDocumentDetail>>(`/novels/${id}/export-as-document`, {});
  return data;
}

export async function recommendNovelWritingPlatform(id: string) {
  const { data } = await apiClient.post<ApiResponse<WritingPlatformRecommendation>>(`/novels/${id}/writing-platform/recommend`);
  return data;
}

export async function updateNovelWritingPlatform(id: string, platform: WritingPlatform) {
  const { data } = await apiClient.put<ApiResponse<Novel>>(`/novels/${id}/writing-platform`, { platform });
  return data;
}
