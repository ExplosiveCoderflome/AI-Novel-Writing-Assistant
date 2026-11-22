import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { CharacterProfileSave, CharacterProfileWorkspace } from "@ai-novel/shared/types/director/characterProfile";
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
