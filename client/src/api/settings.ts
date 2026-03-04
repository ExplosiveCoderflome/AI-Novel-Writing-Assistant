import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export interface APIKeyStatus {
  provider: LLMProvider;
  name: string;
  currentModel: string;
  models: string[];
  defaultModel: string;
  isConfigured: boolean;
  isActive: boolean;
}

export async function getAPIKeySettings() {
  const { data } = await apiClient.get<ApiResponse<APIKeyStatus[]>>("/settings/api-keys");
  return data;
}

export async function saveAPIKeySetting(
  provider: LLMProvider,
  payload: {
    key: string;
    model?: string;
    isActive?: boolean;
  },
) {
  const { data } = await apiClient.put<
    ApiResponse<{
      provider: string;
      model: string | null;
      isActive: boolean;
      models: string[];
    }>
  >(`/settings/api-keys/${provider}`, payload);
  return data;
}

export async function refreshProviderModelList(provider: LLMProvider) {
  const { data } = await apiClient.post<
    ApiResponse<{
      provider: string;
      models: string[];
      currentModel: string;
    }>
  >(`/settings/api-keys/${provider}/refresh-models`);
  return data;
}

export async function getLLMProviders() {
  const { data } = await apiClient.get<ApiResponse<Record<string, unknown>>>("/llm/providers");
  return data;
}

export async function testLLMConnection(payload: { provider: LLMProvider; apiKey?: string; model?: string }) {
  const { data } = await apiClient.post<
    ApiResponse<{
      success: boolean;
      model: string;
      latency: number;
    }>
  >("/llm/test", payload);
  return data;
}
