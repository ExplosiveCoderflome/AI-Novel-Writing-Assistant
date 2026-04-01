import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteConfig, ModelRouteTaskType } from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export type EmbeddingProvider = Extract<LLMProvider, "openai" | "siliconflow">;

export interface APIKeyStatus {
  provider: LLMProvider;
  name: string;
  currentModel: string;
  models: string[];
  defaultModel: string;
  isConfigured: boolean;
  isActive: boolean;
}

export type ProviderBalanceStatusKind = "available" | "missing_api_key" | "unsupported" | "error";

export interface ProviderBalanceStatus {
  provider: LLMProvider;
  status: ProviderBalanceStatusKind;
  supported: boolean;
  canRefresh: boolean;
  source: "provider_api" | "aliyun_account" | "none";
  currency: string | null;
  availableBalance: number | null;
  totalBalance: number | null;
  cashBalance: number | null;
  voucherBalance: number | null;
  chargeBalance: number | null;
  toppedUpBalance: number | null;
  grantedBalance: number | null;
  fetchedAt: string;
  message: string;
  error: string | null;
}

export interface RagProviderStatus {
  provider: EmbeddingProvider;
  name: string;
  isConfigured: boolean;
  isActive: boolean;
}

export interface RagEmbeddingModelStatus {
  provider: EmbeddingProvider;
  name: string;
  models: string[];
  defaultModel: string;
  isConfigured: boolean;
  isActive: boolean;
  source: "remote" | "fallback";
}

export interface RagSettingsStatus {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionVersion: number;
  collectionMode: "auto" | "manual";
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
  suggestedCollectionName: string;
  reindexQueuedCount?: number;
  providers: RagProviderStatus[];
}

export interface ModelRoutesResponse {
  taskTypes: ModelRouteTaskType[];
  routes: Array<{
    taskType: string;
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number | null;
  }>;
}

export interface ModelRouteConnectivityStatus {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  ok: boolean;
  latency: number | null;
  error: string | null;
}

export interface ModelRouteConnectivityResponse {
  testedAt: string;
  statuses: ModelRouteConnectivityStatus[];
}

export async function getAPIKeySettings() {
  const { data } = await apiClient.get<ApiResponse<APIKeyStatus[]>>("/settings/api-keys");
  return data;
}

export async function getProviderBalances() {
  const { data } = await apiClient.get<ApiResponse<ProviderBalanceStatus[]>>("/settings/api-keys/balances");
  return data;
}

export async function refreshProviderBalance(provider: LLMProvider) {
  const { data } = await apiClient.post<ApiResponse<ProviderBalanceStatus>>(`/settings/api-keys/${provider}/refresh-balance`);
  return data;
}

export async function getRagSettings() {
  const { data } = await apiClient.get<ApiResponse<RagSettingsStatus>>("/settings/rag");
  return data;
}

export async function saveRagSettings(payload: {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionMode: "auto" | "manual";
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
}) {
  const { data } = await apiClient.put<
    ApiResponse<
      Pick<
        RagSettingsStatus,
        | "embeddingProvider"
        | "embeddingModel"
        | "collectionVersion"
        | "collectionMode"
        | "collectionName"
        | "collectionTag"
        | "autoReindexOnChange"
        | "embeddingBatchSize"
        | "embeddingTimeoutMs"
        | "embeddingMaxRetries"
        | "embeddingRetryBaseMs"
        | "suggestedCollectionName"
        | "reindexQueuedCount"
      >
    >
  >("/settings/rag", payload);
  return data;
}

export async function getRagEmbeddingModels(provider: EmbeddingProvider) {
  const { data } = await apiClient.get<ApiResponse<RagEmbeddingModelStatus>>(`/settings/rag/models/${provider}`);
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

export async function getModelRoutes() {
  const { data } = await apiClient.get<ApiResponse<ModelRoutesResponse>>("/llm/model-routes");
  return data;
}

export async function testModelRouteConnectivity() {
  const { data } = await apiClient.post<ApiResponse<ModelRouteConnectivityResponse>>("/llm/model-routes/connectivity");
  return data;
}

export async function saveModelRoute(payload: ModelRouteConfig) {
  const { data } = await apiClient.put<ApiResponse<null>>("/llm/model-routes", payload);
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
