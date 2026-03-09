import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  Chapter,
  ChapterSummary,
  CharacterTimeline,
  Character,
  Novel,
  NovelBible,
  PipelineJob,
  PlotBeat,
  QualityScore,
  ReviewIssue,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export interface NovelListResponse {
  items: Array<
    Novel & {
      _count: {
        chapters: number;
        characters: number;
      };
      genre?: {
        id: string;
        name: string;
      } | null;
      world?: {
        id: string;
        name: string;
        worldType?: string | null;
      } | null;
    }
  >;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NovelDetailResponse extends Novel {
  chapters: Chapter[];
  characters: Character[];
  bible?: NovelBible | null;
  plotBeats?: PlotBeat[];
  genre?: {
    id: string;
    name: string;
  } | null;
  world?: {
    id: string;
    name: string;
    worldType?: string | null;
    description?: string | null;
    overviewSummary?: string | null;
    axioms?: string | null;
    magicSystem?: string | null;
    conflicts?: string | null;
  } | null;
}

export interface DraftOptimizePreview {
  optimizedDraft: string;
  mode: "full" | "selection";
  selectedText?: string | null;
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

export async function getNovelList(params?: { page?: number; limit?: number }) {
  const { data } = await apiClient.get<ApiResponse<NovelListResponse>>("/novels", {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 10,
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
  genreId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  sourceNovelId?: string;
  sourceKnowledgeDocumentId?: string;
  continuationBookAnalysisId?: string;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[];
}) {
  const { data } = await apiClient.post<ApiResponse<Novel>>("/novels", payload);
  return data;
}

export async function updateNovel(
  id: string,
  payload: Partial<{
    title: string;
    description: string;
    status: "draft" | "published";
    writingMode: "original" | "continuation";
    sourceNovelId: string | null;
    sourceKnowledgeDocumentId: string | null;
    continuationBookAnalysisId: string | null;
    continuationBookAnalysisSections: BookAnalysisSectionKey[] | null;
    genreId: string | null;
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

export async function getNovelChapters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Chapter[]>>(`/novels/${id}/chapters`);
  return data;
}

export async function createNovelChapter(
  id: string,
  payload: {
    title: string;
    order: number;
    content?: string;
    expectation?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(`/novels/${id}/chapters`, payload);
  return data;
}

export async function updateNovelChapter(
  id: string,
  chapterId: string,
  payload: Partial<{
    title: string;
    order: number;
    content: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload);
  return data;
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getNovelCharacters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Character[]>>(`/novels/${id}/characters`);
  return data;
}

export async function createNovelCharacter(
  id: string,
  payload: {
    name: string;
    role: string;
    personality?: string;
    background?: string;
    development?: string;
    currentState?: string;
    currentGoal?: string;
    baseCharacterId?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Character>>(`/novels/${id}/characters`, payload);
  return data;
}

export async function updateNovelCharacter(
  id: string,
  charId: string,
  payload: Partial<{
    name: string;
    role: string;
    personality: string;
    background: string;
    development: string;
    currentState: string;
    currentGoal: string;
    baseCharacterId: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Character>>(`/novels/${id}/characters/${charId}`, payload);
  return data;
}

export async function deleteNovelCharacter(id: string, charId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/characters/${charId}`);
  return data;
}

export async function getCharacterTimeline(id: string, charId: string) {
  const { data } = await apiClient.get<ApiResponse<CharacterTimeline[]>>(`/novels/${id}/characters/${charId}/timeline`);
  return data;
}

export async function syncCharacterTimeline(
  id: string,
  charId: string,
  payload?: {
    startOrder?: number;
    endOrder?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      characterId: string;
      syncedCount: number;
      totalTimelineCount: number;
    }>
  >(`/novels/${id}/characters/${charId}/timeline/sync`, payload ?? {});
  return data;
}

export async function syncAllCharacterTimeline(
  id: string,
  payload?: {
    startOrder?: number;
    endOrder?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      characterCount: number;
      syncedCount: number;
      details: Array<{
        characterId: string;
        syncedCount: number;
        totalTimelineCount: number;
      }>;
    }>
  >(`/novels/${id}/characters/timeline/sync`, payload ?? {});
  return data;
}

export async function evolveNovelCharacter(
  id: string,
  charId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Character>>(
    `/novels/${id}/characters/${charId}/evolve`,
    payload ?? {},
  );
  return data;
}

export async function checkCharacterAgainstWorld(
  id: string,
  charId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      status: "pass" | "warn" | "error";
      warnings: string[];
      issues: Array<{ severity: "warn" | "error"; message: string; suggestion?: string }>;
    }>
  >(`/novels/${id}/world-check/characters/${charId}`, payload ?? {});
  return data;
}

export async function generateNovelTitles(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      titles: Array<{
        title: string;
        clickRate: number;
        style: "literary" | "conflict";
      }>;
    }>
  >(`/novels/${id}/title/generate`, payload ?? {});
  return data;
}

export async function runNovelPipeline(
  id: string,
  payload: {
    startOrder: number;
    endOrder: number;
    maxRetries?: number;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/run`, payload);
  return data;
}

export async function getNovelPipelineJob(id: string, jobId: string) {
  const { data } = await apiClient.get<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/jobs/${jobId}`);
  return data;
}

export async function reviewNovelChapter(
  id: string,
  chapterId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    content?: string;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      score: QualityScore;
      issues: ReviewIssue[];
    }>
  >(`/novels/${id}/chapters/${chapterId}/review`, payload ?? {});
  return data;
}

export async function getNovelQualityReport(id: string) {
  const { data } = await apiClient.get<
    ApiResponse<{
      novelId: string;
      summary: QualityScore;
      chapterReports: Array<{
        chapterId?: string | null;
        coherence: number;
        repetition: number;
        pacing: number;
        voice: number;
        engagement: number;
        overall: number;
        issues?: string | null;
      }>;
      totalReports?: number;
    }>
  >(`/novels/${id}/quality-report`);
  return data;
}

export async function generateChapterHook(
  id: string,
  payload?: {
    chapterId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      chapterId: string;
      hook: string;
      nextExpectation: string;
    }>
  >(`/novels/${id}/hooks/generate`, payload ?? {});
  return data;
}

export async function optimizeNovelOutlinePreview(
  id: string,
  payload: {
    currentDraft: string;
    instruction: string;
    mode?: "full" | "selection";
    selectedText?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<DraftOptimizePreview>>(
    `/novels/${id}/outline/optimize-preview`,
    payload,
  );
  return data;
}

export async function optimizeNovelStructuredOutlinePreview(
  id: string,
  payload: {
    currentDraft: string;
    instruction: string;
    mode?: "full" | "selection";
    selectedText?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<DraftOptimizePreview>>(
    `/novels/${id}/structured-outline/optimize-preview`,
    payload,
  );
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

export async function downloadNovelExport(id: string, format: "txt" | "markdown" = "txt") {
  const response = await apiClient.get<Blob>(`/novels/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  const fallback = format === "markdown" ? `novel-${id}.md` : `novel-${id}.txt`;
  return {
    blob: response.data,
    fileName: extractFileName(response.headers["content-disposition"], fallback),
  };
}

