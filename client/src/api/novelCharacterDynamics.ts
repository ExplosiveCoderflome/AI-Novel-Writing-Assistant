import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CharacterCandidate,
  CharacterRelationStage,
  DynamicCharacterOverview,
} from "@ai-novel/shared/types/characterDynamics";
import { apiClient } from "./client";

export async function getCharacterDynamicsOverview(id: string, chapterOrder?: number) {
  const { data } = await apiClient.get<ApiResponse<DynamicCharacterOverview>>(`/novels/${id}/character-dynamics/overview`, {
    params: typeof chapterOrder === "number" ? { chapterOrder } : undefined,
  });
  return data;
}

export async function getCharacterCandidates(id: string) {
  const { data } = await apiClient.get<ApiResponse<CharacterCandidate[]>>(`/novels/${id}/character-candidates`);
  return data;
}

export async function confirmCharacterCandidate(
  id: string,
  candidateId: string,
  payload?: Partial<{
    role: string;
    castRole: string;
    relationToProtagonist: string;
    currentState: string;
    currentGoal: string;
    summary: string;
  }>,
) {
  const { data } = await apiClient.post<ApiResponse<{ candidateId: string; characterId: string }>>(
    `/novels/${id}/character-candidates/${candidateId}/confirm`,
    payload ?? {},
  );
  return data;
}

export async function mergeCharacterCandidate(
  id: string,
  candidateId: string,
  payload: {
    characterId: string;
    summary?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{ candidateId: string; characterId: string }>>(
    `/novels/${id}/character-candidates/${candidateId}/merge`,
    payload,
  );
  return data;
}

export async function updateCharacterDynamicState(
  id: string,
  characterId: string,
  payload: Partial<{
    currentState: string;
    currentGoal: string;
    factionLabel: string;
    stanceLabel: string;
    summary: string;
    volumeId: string;
    chapterId: string;
    chapterOrder: number;
    roleLabel: string;
    responsibility: string;
    appearanceExpectation: string;
    plannedChapterOrders: number[];
    isCore: boolean;
    absenceWarningThreshold: number;
    absenceHighRiskThreshold: number;
    decisionNote: string;
  }>,
) {
  const { data } = await apiClient.patch<ApiResponse<DynamicCharacterOverview>>(
    `/novels/${id}/characters/${characterId}/dynamic-state`,
    payload,
  );
  return data;
}

export async function updateCharacterRelationStage(
  id: string,
  relationId: string,
  payload: {
    stageLabel: string;
    stageSummary: string;
    nextTurnPoint?: string;
    volumeId?: string;
    chapterId?: string;
    chapterOrder?: number;
    confidence?: number;
    decisionNote?: string;
  },
) {
  const { data } = await apiClient.patch<ApiResponse<CharacterRelationStage>>(
    `/novels/${id}/character-relations/${relationId}/stage`,
    payload,
  );
  return data;
}

export async function rebuildCharacterDynamics(id: string) {
  const { data } = await apiClient.post<ApiResponse<DynamicCharacterOverview>>(
    `/novels/${id}/character-dynamics/rebuild`,
    {},
  );
  return data;
}
