import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  ChapterEditorAiRevisionRequest,
  ChapterEditorAiRevisionResponse,
  Chapter,
  ChapterEditorWorkspaceResponse,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
  ChapterStatus,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

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
    chapterStatus?: ChapterStatus;
    targetWordCount?: number;
    conflictLevel?: number;
    revealLevel?: number;
    mustAvoid?: string;
    taskSheet?: string;
    sceneCards?: string;
    repairHistory?: string;
    qualityScore?: number;
    continuityScore?: number;
    characterScore?: number;
    pacingScore?: number;
    riskFlags?: string;
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
    expectation: string;
    chapterStatus: ChapterStatus;
    targetWordCount: number;
    conflictLevel: number;
    revealLevel: number;
    mustAvoid: string;
    taskSheet: string;
    sceneCards: string;
    repairHistory: string;
    qualityScore: number;
    continuityScore: number;
    characterScore: number;
    pacingScore: number;
    riskFlags: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload);
  return data;
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getChapterTraces(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<import("@ai-novel/shared/types/agent").AgentRun[]>>(
    `/novels/${novelId}/chapters/${chapterId}/traces`,
  );
  return data;
}

export async function previewChapterRewrite(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorRewritePreviewRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorRewritePreviewResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/rewrite-preview`,
    payload,
  );
  return data;
}

export async function getChapterEditorWorkspace(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorWorkspaceResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/workspace`,
  );
  return data;
}

export async function previewChapterAiRevision(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorAiRevisionRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorAiRevisionResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/ai-revision-preview`,
    payload,
  );
  return data;
}

export async function generateChapterExecutionContract(
  novelId: string,
  chapterId: string,
  payload: Partial<{
    provider: import("@ai-novel/shared/types/llm").LLMProvider;
    model: string;
    temperature: number;
  }> = {},
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(
    `/novels/${novelId}/chapters/${chapterId}/execution-contract`,
    payload,
  );
  return data;
}
