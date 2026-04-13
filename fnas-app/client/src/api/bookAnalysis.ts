import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSectionOptimizePreview,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

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
  includeTimeline?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>("/book-analysis", payload);
  return data;
}

export async function rebuildBookAnalysis(id: string) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(`/book-analysis/${id}/rebuild`, {});
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

export async function regenerateBookAnalysisSection(id: string, sectionKey: BookAnalysisSectionKey) {
  const { data } = await apiClient.post<ApiResponse<BookAnalysisDetail>>(
    `/book-analysis/${id}/sections/${sectionKey}/regenerate`,
    {},
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
