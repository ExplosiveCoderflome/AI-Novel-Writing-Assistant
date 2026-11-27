import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { CharacterProfileSave, CharacterProfileWorkspace } from "@ai-novel/shared/types/director/characterProfile";
import type { CharacterProfileImpactApply, CharacterProfileImpactApplyResult, CharacterProfileImpactPreview, CharacterProfileImpactRequest } from "@ai-novel/shared/types/director/characterProfileImpact";
import { apiClient } from "./client";

export const directorCharacterProfilePath = (novelId: string, characterId: string) =>
  `/director-next/novels/${encodeURIComponent(novelId)}/characters/${encodeURIComponent(characterId)}/profile`;

export const directorCharacterProfileKey = (novelId: string, characterId: string) =>
  ["director-character-profile", novelId, characterId] as const;

export async function getDirectorCharacterProfile(novelId: string, characterId: string) {
  const {data} = await apiClient.get<ApiResponse<CharacterProfileWorkspace>>(
    directorCharacterProfilePath(novelId, characterId), {errorPresentation: "inline"},
  );
  if (!data.data) throw new Error("没有读取到角色资料。");
  return data.data;
}

export async function saveDirectorCharacterProfile(novelId: string, characterId: string, input: CharacterProfileSave) {
  const {data} = await apiClient.patch<ApiResponse<CharacterProfileWorkspace>>(
    directorCharacterProfilePath(novelId, characterId), input, {errorPresentation: "inline"},
  );
  if (!data.data) throw new Error("没有读取到保存后的角色资料。");
  return data.data;
}

export async function previewDirectorCharacterProfileImpact(novelId: string, characterId: string, input: CharacterProfileImpactRequest) {
  const {data} = await apiClient.post<ApiResponse<CharacterProfileImpactPreview>>(
    `${directorCharacterProfilePath(novelId, characterId)}/impact`, input, {errorPresentation: "inline"},
  );
  if (!data.data) throw new Error("角色资料影响分析失败。");
  return data.data;
}

export async function applyDirectorCharacterProfileImpact(novelId: string, characterId: string, input: CharacterProfileImpactApply) {
  const {data} = await apiClient.post<ApiResponse<CharacterProfileImpactApplyResult>>(
    `${directorCharacterProfilePath(novelId, characterId)}/impact/apply`, input, {errorPresentation: "inline"},
  );
  if (!data.data) throw new Error("角色资料及影响建议保存失败。");
  return data.data;
}
