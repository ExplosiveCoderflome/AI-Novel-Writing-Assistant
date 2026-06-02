import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  NovelWorldGenerateInput,
  NovelWorldImportInput,
  NovelWorldManualInput,
  NovelWorldSaveToLibraryInput,
  NovelWorldSyncDiff,
  NovelWorldSyncInput,
  NovelWorldView,
} from "@ai-novel/shared/types/novelWorld";
import type {
  StoryWorldSliceBuilderMode,
  StoryWorldSliceOverrides,
  StoryWorldSliceView,
} from "@ai-novel/shared/types/storyWorldSlice";
import { apiClient } from "./client";

export async function getNovelWorld(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelWorldView>>(`/novels/${id}/novel-world`);
  return data;
}

export async function importNovelWorldFromLibrary(id: string, payload: NovelWorldImportInput) {
  const { data } = await apiClient.post<ApiResponse<NovelWorldView>>(`/novels/${id}/novel-world/import`, payload);
  return data;
}

export async function createManualNovelWorld(id: string, payload: NovelWorldManualInput) {
  const { data } = await apiClient.post<ApiResponse<NovelWorldView>>(`/novels/${id}/novel-world/manual`, payload);
  return data;
}

export async function generateNovelWorldFromTheme(id: string, payload: NovelWorldGenerateInput) {
  const { data } = await apiClient.post<ApiResponse<NovelWorldView>>(`/novels/${id}/novel-world/generate`, payload);
  return data;
}

export async function saveNovelWorldToLibrary(id: string, payload: NovelWorldSaveToLibraryInput) {
  const { data } = await apiClient.post<ApiResponse<NovelWorldView>>(`/novels/${id}/novel-world/save-to-library`, payload);
  return data;
}

export async function getNovelWorldSyncDiff(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelWorldSyncDiff>>(`/novels/${id}/novel-world/sync-diff`);
  return data;
}

export async function syncNovelWorldWithLibrary(id: string, payload: NovelWorldSyncInput) {
  const { data } = await apiClient.post<ApiResponse<NovelWorldSyncDiff>>(`/novels/${id}/novel-world/sync`, payload);
  return data;
}

export async function getNovelWorldSlice(id: string) {
  const { data } = await apiClient.get<ApiResponse<StoryWorldSliceView>>(`/novels/${id}/world-slice`);
  return data;
}

export async function refreshNovelWorldSlice(
  id: string,
  payload?: {
    storyInput?: string;
    builderMode?: StoryWorldSliceBuilderMode;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StoryWorldSliceView>>(
    `/novels/${id}/world-slice/refresh`,
    payload ?? {},
  );
  return data;
}

export async function updateNovelWorldSliceOverrides(id: string, payload: StoryWorldSliceOverrides) {
  const { data } = await apiClient.put<ApiResponse<StoryWorldSliceView>>(`/novels/${id}/world-slice/overrides`, payload);
  return data;
}
