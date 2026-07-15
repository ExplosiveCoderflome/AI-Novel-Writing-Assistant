import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  VisualAssetCatalogFacets,
  VisualAssetCatalogPage,
  VisualAssetKind,
  VisualAssetScopeRef,
  VisualAssetSelection,
  VisualAssetSourceDomain,
} from "@ai-novel/shared/types/visualAsset";
import { apiClient } from "./client";

export interface VisualAssetCatalogRequest {
  scope?: VisualAssetScopeRef;
  allowedKinds?: readonly VisualAssetKind[];
  kind?: VisualAssetKind;
  source?: VisualAssetSourceDomain;
  query?: string;
  cursor?: string;
  limit?: number;
}

function toCatalogParams(request: VisualAssetCatalogRequest) {
  return {
    scopeKind: request.scope?.kind,
    scopeId: request.scope?.id ?? undefined,
    allowedKinds: request.allowedKinds?.join(",") || undefined,
    kind: request.kind,
    source: request.source,
    query: request.query?.trim() || undefined,
    cursor: request.cursor,
    limit: request.limit,
  };
}

export async function listVisualAssets(request: VisualAssetCatalogRequest = {}) {
  const { data } = await apiClient.get<ApiResponse<VisualAssetCatalogPage>>("/visual-assets", {
    params: toCatalogParams(request),
  });
  return data;
}

export async function getVisualAssetFacets(request: Omit<VisualAssetCatalogRequest, "cursor" | "limit"> = {}) {
  const { data } = await apiClient.get<ApiResponse<VisualAssetCatalogFacets>>("/visual-assets/facets", {
    params: toCatalogParams(request),
  });
  return data;
}

export async function getVisualAsset(assetId: string) {
  const { data } = await apiClient.get<ApiResponse<VisualAssetSelection>>(`/visual-assets/${assetId}`);
  return data;
}

export const visualAssetQueryKeys = {
  catalog: (request: Omit<VisualAssetCatalogRequest, "cursor">) => [
    "visual-assets",
    "catalog",
    request.scope?.kind ?? "all",
    request.scope?.id ?? "all",
    request.allowedKinds?.join(",") ?? "all",
    request.kind ?? "all",
    request.source ?? "all",
    request.query?.trim() ?? "",
    request.limit ?? "default",
  ] as const,
  facets: (request: Omit<VisualAssetCatalogRequest, "cursor" | "limit">) => [
    "visual-assets",
    "facets",
    request.scope?.kind ?? "all",
    request.scope?.id ?? "all",
    request.allowedKinds?.join(",") ?? "all",
    request.query?.trim() ?? "",
  ] as const,
  detail: (assetId: string) => ["visual-assets", "detail", assetId] as const,
};
