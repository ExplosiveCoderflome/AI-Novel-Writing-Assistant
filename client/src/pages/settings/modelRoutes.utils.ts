import type {
  APIKeyStatus,
  ModelRouteConnectivityStatus,
  ModelRoutesResponse,
} from "@/api/settings";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@ai-novel/shared/types/novel";

export interface RouteDraft {
  provider: string;
  model: string;
  temperature: string;
  maxTokens: string;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}

export interface StructuredFallbackDraft extends RouteDraft {
  enabled: boolean;
}

export type ConnectivityState = "idle" | "checking" | "healthy" | "failed";
type SavedModelRoute = ModelRoutesResponse["routes"][number];

export interface RouteSavePayload {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number | null;
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
}

export function getProviderConfig(providerConfigs: APIKeyStatus[], provider: string) {
  return providerConfigs.find((item) => item.provider === provider);
}

export function getProviderDisplayName(providerConfigs: APIKeyStatus[], provider: string): string {
  const config = getProviderConfig(providerConfigs, provider);
  return config?.displayName ?? config?.name ?? provider;
}

export function getPreferredModel(config: APIKeyStatus | undefined): string {
  return config?.currentModel || config?.models?.[0] || "";
}

export function getModelOptions(providerConfigs: APIKeyStatus[], provider: string, currentModel: string): string[] {
  const config = getProviderConfig(providerConfigs, provider);
  const models = config?.models ?? [];
  return [...new Set([currentModel, ...models].filter(Boolean))];
}

export function getStructuredResponseFormatOptions(
  requestProtocol: ModelRouteRequestProtocol,
): ModelRouteStructuredResponseFormat[] {
  return requestProtocol === "anthropic"
    ? ["prompt_json"]
    : ["auto", "json_schema", "json_object", "prompt_json"];
}

function parseTemperature(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMaxTokens(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

export function buildRouteSavePayload(taskType: ModelRouteTaskType, draft: RouteDraft): RouteSavePayload {
  return {
    taskType,
    provider: draft.provider,
    model: draft.model,
    temperature: parseTemperature(draft.temperature, 0.7),
    maxTokens: parseMaxTokens(draft.maxTokens),
    requestProtocol: draft.requestProtocol,
    structuredResponseFormat: draft.structuredResponseFormat,
  };
}

export function isSameRouteDraft(draft: RouteDraft, route: SavedModelRoute | undefined): boolean {
  if (!route) {
    return false;
  }
  return draft.provider === route.provider
    && draft.model.trim() === route.model
    && parseTemperature(draft.temperature, 0.7) === route.temperature
    && parseMaxTokens(draft.maxTokens) === route.maxTokens
    && draft.requestProtocol === route.requestProtocol
    && draft.structuredResponseFormat === route.structuredResponseFormat;
}

export function formatStructuredStatus(status: ModelRouteConnectivityStatus["structured"]): string {
  if (!status) {
    return "结构化诊断：未执行";
  }
  if (status.ok) {
    return `结构化正常 · ${status.requestProtocol ?? "auto"} · ${status.strategy ?? "prompt_json"}${status.reasoningForcedOff ? " · 会关闭 thinking" : ""}`;
  }
  return `结构化异常 · ${status.errorCategory ?? "unknown"} · ${status.error ?? "未知错误"}`;
}

export function formatConnectivityStatus(status?: ModelRouteConnectivityStatus | null): string {
  if (!status) {
    return "尚未检测生效路由。";
  }
  const parts: string[] = [];
  if (status.plain) {
    parts.push(
      status.plain.ok
        ? `普通连通正常${status.plain.latency != null ? ` · ${status.plain.latency}ms` : ""}`
        : `普通连通失败 · ${status.plain.error ?? "未知错误"}`,
    );
  }
  parts.push(formatStructuredStatus(status.structured));
  return `${status.provider} / ${status.model} · ${parts.join(" · ")}`;
}

export function resolveConnectivityState(
  status: ModelRouteConnectivityStatus | undefined,
  checking: boolean,
): ConnectivityState {
  if (checking) {
    return "checking";
  }
  if (!status) {
    return "idle";
  }
  if ((status.plain && !status.plain.ok) || (status.structured && !status.structured.ok)) {
    return "failed";
  }
  if (status.plain?.ok || status.structured?.ok) {
    return "healthy";
  }
  return "idle";
}
