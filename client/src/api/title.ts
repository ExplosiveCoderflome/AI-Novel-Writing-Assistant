import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  TitleFactoryMode,
  TitleFactorySuggestion,
  TitleLibraryEntry,
  TitleLibraryListResult,
} from "@ai-novel/shared/types/title";
import { apiClient } from "./client";

export interface TitleLibraryListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  genreId?: string;
  sort?: "newest" | "hot" | "clickRate";
}

export function buildTitleLibraryListKey(params: TitleLibraryListParams = {}): string {
  const query = new URLSearchParams();
  if (params.page) {
    query.set("page", String(params.page));
  }
  if (params.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }
  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }
  if (params.genreId?.trim()) {
    query.set("genreId", params.genreId.trim());
  }
  if (params.sort) {
    query.set("sort", params.sort);
  }
  return query.toString();
}

export async function listTitleLibrary(params: TitleLibraryListParams = {}) {
  const { data } = await apiClient.get<ApiResponse<TitleLibraryListResult>>("/title-library", {
    params: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 24,
      search: params.search?.trim() || undefined,
      genreId: params.genreId?.trim() || undefined,
      sort: params.sort ?? "newest",
    },
  });
  return data;
}

export async function createTitleLibraryEntry(payload: {
  title: string;
  description?: string | null;
  clickRate?: number | null;
  keywords?: string | null;
  genreId?: string | null;
}) {
  const { data } = await apiClient.post<ApiResponse<TitleLibraryEntry>>("/title-library", payload);
  return data;
}

export async function deleteTitleLibraryEntry(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/title-library/${id}`);
  return data;
}

export async function markTitleLibraryUsed(id: string) {
  const { data } = await apiClient.post<ApiResponse<TitleLibraryEntry>>(`/title-library/${id}/use`, {});
  return data;
}

export async function generateTitleIdeas(payload: {
  mode: TitleFactoryMode;
  brief?: string;
  referenceTitle?: string;
  genreId?: string | null;
  count?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<{ titles: TitleFactorySuggestion[] }>>("/title-library/generate", payload);
  return data;
}
