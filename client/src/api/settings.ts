import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorAutoApprovalPreferenceSettings,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ModelRouteConfig,
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export type EmbeddingProvider = Extract<LLMProvider, "openai" | "siliconflow">;

export interface APIKeyStatus {
  provider: LLMProvider;
  kind: "builtin" | "custom";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: string | null;
  currentBaseURL: string;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: string | null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  concurrencyLimit: number;
  requestIntervalMs: number;
  supportsImageGeneration: boolean;
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
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKeyConfigured: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
  suggestedCollectionName: string;
  reindexQueuedCount?: number;
  providers: RagProviderStatus[];
}

export interface StyleEngineRuntimeSettingsStatus {
  styleExtractionTimeoutMs: number;
  defaultStyleExtractionTimeoutMs: number;
  minStyleExtractionTimeoutMs: number;
  maxStyleExtractionTimeoutMs: number;
}

export interface ModelRoutesResponse {
  taskTypes: ModelRouteTaskType[];
  routes: Array<{
    taskType: string;
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number | null;
    requestProtocol: ModelRouteRequestProtocol;
    structuredResponseFormat: ModelRouteStructuredResponseFormat;
  }>;
}

export interface ModelRouteConnectivityStatus {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  ok: boolean;
  latency: number | null;
  error: string | null;
  requestProtocol: ModelRouteRequestProtocol | null;
  plain: {
    ok: boolean;
    latency: number | null;
    error: string | null;
    requestProtocol: ModelRouteRequestProtocol | null;
  } | null;
  structured: {
    ok: boolean;
    latency: number | null;
    error: string | null;
    requestProtocol: ModelRouteRequestProtocol | null;
    strategy: string | null;
    reasoningForcedOff: boolean;
    fallbackAvailable: boolean;
    fallbackUsed: boolean;
    errorCategory: string | null;
    nativeJsonObject: boolean;
    nativeJsonSchema: boolean;
    profileFamily: string | null;
  } | null;
}

export interface ModelRouteConnectivityResponse {
  testedAt: string;
  statuses: ModelRouteConnectivityStatus[];
}

export interface StructuredFallbackSettings {
  enabled: boolean;
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number | null;
}

export interface AutoDirectorChannelConfig {
  webhookUrl: string;
  callbackToken: string;
  operatorMapJson: string;
  eventTypes: string[];
}

export interface AutoDirectorChannelSettings {
  baseUrl: string;
  dingtalk: AutoDirectorChannelConfig;
  wecom: AutoDirectorChannelConfig;
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
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKey?: string;
  clearQdrantApiKey?: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
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
        | "enabled"
        | "qdrantUrl"
        | "qdrantApiKeyConfigured"
        | "qdrantTimeoutMs"
        | "qdrantUpsertMaxBytes"
        | "chunkSize"
        | "chunkOverlap"
        | "vectorCandidates"
        | "keywordCandidates"
        | "finalTopK"
        | "workerPollMs"
        | "workerMaxAttempts"
        | "workerRetryBaseMs"
        | "httpTimeoutMs"
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

export async function getStyleEngineRuntimeSettings() {
  const { data } = await apiClient.get<ApiResponse<StyleEngineRuntimeSettingsStatus>>("/settings/style-engine-runtime");
  return data;
}

export async function saveStyleEngineRuntimeSettings(payload: {
  styleExtractionTimeoutMs: number;
}) {
  const { data } = await apiClient.put<ApiResponse<StyleEngineRuntimeSettingsStatus>>(
    "/settings/style-engine-runtime",
    payload,
  );
  return data;
}

export async function saveAPIKeySetting(
  provider: LLMProvider,
  payload: {
    displayName?: string;
    key?: string;
    model?: string;
    imageModel?: string;
    baseURL?: string;
    isActive?: boolean;
    reasoningEnabled?: boolean;
    concurrencyLimit?: number;
    requestIntervalMs?: number;
  },
) {
  const { data } = await apiClient.put<
    ApiResponse<{
      provider: string;
      displayName: string | null;
      model: string | null;
      imageModel: string | null;
      baseURL: string | null;
      isActive: boolean;
      reasoningEnabled: boolean;
      concurrencyLimit: number;
      requestIntervalMs: number;
      models: string[];
      imageModels: string[];
      supportsImageGeneration: boolean;
    }>
  >(`/settings/api-keys/${provider}`, payload);
  return data;
}

export async function createCustomProvider(payload: {
  name: string;
  key?: string;
  model: string;
  baseURL: string;
  isActive?: boolean;
  reasoningEnabled?: boolean;
  concurrencyLimit?: number;
  requestIntervalMs?: number;
}) {
  const { data } = await apiClient.post<
    ApiResponse<{
      provider: string;
      displayName: string | null;
      model: string | null;
      baseURL: string | null;
      isActive: boolean;
      reasoningEnabled: boolean;
      concurrencyLimit: number;
      requestIntervalMs: number;
      models: string[];
    }>
  >("/settings/custom-providers", payload);
  return data;
}

export async function deleteCustomProvider(provider: LLMProvider) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/settings/custom-providers/${provider}`);
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

export async function getStructuredFallbackConfig() {
  const { data } = await apiClient.get<ApiResponse<StructuredFallbackSettings>>("/llm/structured-fallback");
  return data;
}

export async function saveStructuredFallbackConfig(payload: Partial<StructuredFallbackSettings>) {
  const { data } = await apiClient.put<ApiResponse<StructuredFallbackSettings>>("/llm/structured-fallback", payload);
  return data;
}

export async function getAutoDirectorChannelSettings() {
  const { data } = await apiClient.get<ApiResponse<AutoDirectorChannelSettings>>("/settings/auto-director/channels");
  return data;
}

export async function saveAutoDirectorChannelSettings(payload: Partial<AutoDirectorChannelSettings>) {
  const { data } = await apiClient.put<ApiResponse<AutoDirectorChannelSettings>>("/settings/auto-director/channels", payload);
  return data;
}

export async function getAutoDirectorApprovalPreferenceSettings() {
  const { data } = await apiClient.get<ApiResponse<DirectorAutoApprovalPreferenceSettings>>(
    "/settings/auto-director/approval-preferences",
  );
  return data;
}

export async function saveAutoDirectorApprovalPreferenceSettings(payload: {
  approvalPointCodes: string[];
}) {
  const { data } = await apiClient.put<ApiResponse<DirectorAutoApprovalPreferenceSettings>>(
    "/settings/auto-director/approval-preferences",
    payload,
  );
  return data;
}

export async function testLLMConnection(payload: {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  probeMode?: "plain" | "structured" | "both";
}) {
  const { data } = await apiClient.post<
    ApiResponse<{
      success: boolean;
      model: string;
      latency: number;
      plain: {
        ok: boolean;
        latency: number | null;
        error: string | null;
      } | null;
      structured: {
        ok: boolean;
        latency: number | null;
        error: string | null;
        strategy: string | null;
        reasoningForcedOff: boolean;
        fallbackAvailable: boolean;
        fallbackUsed: boolean;
        errorCategory: string | null;
        nativeJsonObject: boolean;
        nativeJsonSchema: boolean;
        profileFamily: string | null;
      } | null;
    }>
  >("/llm/test", payload);
  return data;
}
