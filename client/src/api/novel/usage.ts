import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { NovelUsagePage, NovelUsageQuery } from "@ai-novel/shared/types/llmUsage";
import { apiClient } from "../client";

export async function getNovelUsage(novelId: string, params: NovelUsageQuery = {}): Promise<ApiResponse<NovelUsagePage>> {
  const { data } = await apiClient.get<ApiResponse<NovelUsagePage>>(`/director-next/novels/${encodeURIComponent(novelId)}/usage`, { params });
  return data;
}
