import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  Character,
  CharacterCastApplyResult,
  CharacterCastOptionClearResult,
  CharacterCastOptionDeleteResult,
  CharacterCastOption,
  CharacterRelation,
  CharacterTimeline,
  SupplementalCharacterApplyResult,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

export async function getNovelCharacters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Character[]>>(`/novels/${id}/characters`);
  return data;
}

export async function getCharacterRelations(id: string) {
  const { data } = await apiClient.get<ApiResponse<CharacterRelation[]>>(`/novels/${id}/character-relations`);
  return data;
}

export async function getCharacterCastOptions(id: string) {
  const { data } = await apiClient.get<ApiResponse<CharacterCastOption[]>>(`/novels/${id}/character-prep/cast-options`);
  return data;
}

export async function generateCharacterCastOptions(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    storyInput?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<CharacterCastOption[]>>(
    `/novels/${id}/character-prep/cast-options/generate`,
    payload ?? {},
  );
  return data;
}

export async function applyCharacterCastOption(id: string, optionId: string) {
  const { data } = await apiClient.post<ApiResponse<CharacterCastApplyResult>>(
    `/novels/${id}/character-prep/cast-options/${optionId}/apply`,
    {},
  );
  return data;
}

export async function deleteCharacterCastOption(id: string, optionId: string) {
  const { data } = await apiClient.delete<ApiResponse<CharacterCastOptionDeleteResult>>(
    `/novels/${id}/character-prep/cast-options/${optionId}`,
  );
  return data;
}

export async function clearCharacterCastOptions(id: string) {
  const { data } = await apiClient.delete<ApiResponse<CharacterCastOptionClearResult>>(
    `/novels/${id}/character-prep/cast-options`,
  );
  return data;
}

export async function generateSupplementalCharacters(id: string, payload?: SupplementalCharacterGenerateInput) {
  const { data } = await apiClient.post<ApiResponse<SupplementalCharacterGenerationResult>>(
    `/novels/${id}/character-prep/supplemental-characters/generate`,
    payload ?? {},
  );
  return data;
}

export async function applySupplementalCharacter(id: string, candidate: SupplementalCharacterCandidate) {
  const { data } = await apiClient.post<ApiResponse<SupplementalCharacterApplyResult>>(
    `/novels/${id}/character-prep/supplemental-characters/apply`,
    candidate,
  );
  return data;
}

export async function createNovelCharacter(
  id: string,
  payload: {
    name: string;
    role: string;
    gender?: "male" | "female" | "other" | "unknown";
    castRole?: string;
    storyFunction?: string;
    relationToProtagonist?: string;
    personality?: string;
    background?: string;
    development?: string;
    outerGoal?: string;
    innerNeed?: string;
    fear?: string;
    wound?: string;
    misbelief?: string;
    secret?: string;
    moralLine?: string;
    firstImpression?: string;
    arcStart?: string;
    arcMidpoint?: string;
    arcClimax?: string;
    arcEnd?: string;
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
    gender: "male" | "female" | "other" | "unknown";
    castRole: string;
    storyFunction: string;
    relationToProtagonist: string;
    personality: string;
    background: string;
    development: string;
    outerGoal: string;
    innerNeed: string;
    fear: string;
    wound: string;
    misbelief: string;
    secret: string;
    moralLine: string;
    firstImpression: string;
    arcStart: string;
    arcMidpoint: string;
    arcClimax: string;
    arcEnd: string;
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
