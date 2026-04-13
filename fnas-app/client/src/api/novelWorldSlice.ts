import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryWorldSliceBuilderMode,
  StoryWorldSliceOverrides,
  StoryWorldSliceView,
} from "@ai-novel/shared/types/storyWorldSlice";
import { apiClient } from "./client";

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
