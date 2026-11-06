import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LlmInvocationDetail, NovelUsagePage, NovelUsageQuery } from "@ai-novel/shared/types/llmUsage";
import { apiClient } from "../client";

export async function getNovelUsage(novelId: string, params: NovelUsageQuery = {}): Promise<ApiResponse<NovelUsagePage>> {
  const { data } = await apiClient.get<ApiResponse<NovelUsagePage>>(`/director-next/novels/${encodeURIComponent(novelId)}/usage`, { params });
  return data;
}

export async function getNovelInvocation(novelId: string, invocationId: string): Promise<ApiResponse<LlmInvocationDetail>> {
  const { data } = await apiClient.get<ApiResponse<LlmInvocationDetail>>(`/director-next/novels/${encodeURIComponent(novelId)}/usage/${encodeURIComponent(invocationId)}`);
  return data;
}
