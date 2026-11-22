import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { CharacterForwardApply, CharacterForwardPreview } from "@ai-novel/shared/types/characterForwardAdjustment";
import { apiClient } from "./client";

const adjustmentPath = (novelId: string, characterId: string) => (
  `/novels/${encodeURIComponent(novelId)}/characters/${encodeURIComponent(characterId)}/forward-adjust`
);

export const characterForwardPreviewKey = (novelId: string, characterId: string) => ["character-forward-preview", novelId, characterId];

export async function getCharacterForwardPreview(novelId: string, characterId: string): Promise<CharacterForwardPreview> {
  const { data } = await apiClient.get<ApiResponse<CharacterForwardPreview>>(
    `${adjustmentPath(novelId, characterId)}/preview`, { errorPresentation: "inline" },
  );
  if (!data.data) throw new Error("角色调整预览读取失败。");
  return data.data;
}

export async function saveCharacterForwardAdjustment(novelId: string, characterId: string, input: CharacterForwardApply) {
  const { data } = await apiClient.post<ApiResponse<{ effectiveFromChapterOrder: number }>>(
    adjustmentPath(novelId, characterId), input, { errorPresentation: "inline" },
  );
  if (!data.data) throw new Error("角色调整保存失败。");
  return data.data;
}
