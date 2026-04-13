import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroLocks,
  StoryMacroPlan,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import { apiClient } from "./client";

interface LLMPayload {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export async function getNovelStoryMacroPlan(id: string) {
  const { data } = await apiClient.get<ApiResponse<StoryMacroPlan | null>>(`/novels/${id}/story-macro`);
  return data;
}

export async function decomposeNovelStory(
  id: string,
  payload: LLMPayload & { storyInput: string },
) {
  const { data } = await apiClient.post<ApiResponse<StoryMacroPlan>>(`/novels/${id}/story-macro/decompose`, payload);
  return data;
}

export async function buildNovelStoryConstraintEngine(
  id: string,
  payload?: LLMPayload,
) {
  const { data } = await apiClient.post<ApiResponse<StoryMacroPlan>>(
    `/novels/${id}/story-macro/constraint/build`,
    payload ?? {},
  );
  return data;
}

export async function updateNovelStoryMacroPlan(
  id: string,
  payload: {
    storyInput?: string | null;
    expansion?: Partial<StoryExpansion>;
    decomposition?: Partial<StoryDecomposition>;
    constraints?: string[];
    lockedFields?: StoryMacroLocks;
  },
) {
  const { data } = await apiClient.patch<ApiResponse<StoryMacroPlan>>(`/novels/${id}/story-macro`, payload);
  return data;
}

export async function regenerateNovelStoryMacroField(
  id: string,
  field: StoryMacroField,
  payload?: LLMPayload,
) {
  const { data } = await apiClient.post<ApiResponse<StoryMacroPlan>>(
    `/novels/${id}/story-macro/fields/${field}/regenerate`,
    payload ?? {},
  );
  return data;
}

export async function getNovelStoryMacroState(id: string) {
  const { data } = await apiClient.get<ApiResponse<StoryMacroState>>(`/novels/${id}/story-macro/state`);
  return data;
}

export async function updateNovelStoryMacroState(
  id: string,
  payload: Partial<StoryMacroState>,
) {
  const { data } = await apiClient.patch<ApiResponse<StoryMacroState>>(`/novels/${id}/story-macro/state`, payload);
  return data;
}
