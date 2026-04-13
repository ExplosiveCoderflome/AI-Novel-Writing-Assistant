import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export interface CharacterGenerateConstraints {
  storyFunction?: "主角" | "反派" | "导师" | "对照组" | "配角";
  externalGoal?: string;
  internalNeed?: string;
  coreFear?: string;
  moralBottomLine?: string;
  secret?: string;
  coreFlaw?: string;
  relationshipHooks?: string;
  growthStage?: "起点" | "受挫" | "转折" | "觉醒" | "收束";
  toneStyle?: string;
}

export async function getBaseCharacterList(params?: {
  category?: string;
  tags?: string;
  search?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<BaseCharacter[]>>("/base-characters", {
    params,
  });
  return data;
}

export async function getBaseCharacterDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<BaseCharacter>>(`/base-characters/${id}`);
  return data;
}

export async function createBaseCharacter(payload: Omit<BaseCharacter, "id" | "createdAt" | "updatedAt">) {
  const { data } = await apiClient.post<ApiResponse<BaseCharacter>>("/base-characters", payload);
  return data;
}

export async function updateBaseCharacter(
  id: string,
  payload: Partial<Omit<BaseCharacter, "id" | "createdAt" | "updatedAt">>,
) {
  const { data } = await apiClient.put<ApiResponse<BaseCharacter>>(`/base-characters/${id}`, payload);
  return data;
}

export async function deleteBaseCharacter(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/base-characters/${id}`);
  return data;
}

export async function generateBaseCharacter(payload: {
  description: string;
  category: string;
  genre?: string;
  knowledgeDocumentIds?: string[];
  bookAnalysisIds?: string[];
  constraints?: CharacterGenerateConstraints;
  provider?: LLMProvider;
  model?: string;
}) {
  const { data } = await apiClient.post<ApiResponse<BaseCharacter>>(
    "/base-characters/generate",
    payload,
  );
  return data;
}

