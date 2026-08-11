import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  DEFAULT_DIRECTOR_RISK_POLICY as SHARED_DEFAULT_DIRECTOR_RISK_POLICY,
  DIRECTOR_RISK_NOTICE_THRESHOLD_MAX,
  DIRECTOR_RISK_NOTICE_THRESHOLD_MIN,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
  DIRECTOR_RISK_PAUSE_THRESHOLD_MIN,
  type DirectorRiskPolicy as SharedDirectorRiskPolicy,
} from "@ai-novel/shared/types/directorRisk";
import { isAxiosError } from "axios";
import { apiClient } from "./client";

export type DirectorRiskPolicy = SharedDirectorRiskPolicy;

export interface NovelDirectorRiskPolicy extends DirectorRiskPolicy {
  override: DirectorRiskPolicy | null;
  source: "global" | "novel";
}

interface DirectorRiskPolicyPayload extends Partial<DirectorRiskPolicy> {
  policy?: Partial<DirectorRiskPolicy> | null;
  effectivePolicy?: Partial<DirectorRiskPolicy> | null;
  override?: Partial<DirectorRiskPolicy> | null;
  source?: "global" | "novel";
}

export const DEFAULT_DIRECTOR_RISK_POLICY: DirectorRiskPolicy = SHARED_DEFAULT_DIRECTOR_RISK_POLICY;

export function normalizeDirectorRiskPolicy(value?: DirectorRiskPolicyPayload | null): DirectorRiskPolicy {
  const source = value?.effectivePolicy ?? value?.policy ?? value;
  const noticeThreshold = Number.isInteger(source?.noticeThreshold)
    ? Math.min(DIRECTOR_RISK_NOTICE_THRESHOLD_MAX, Math.max(DIRECTOR_RISK_NOTICE_THRESHOLD_MIN, source!.noticeThreshold!))
    : DEFAULT_DIRECTOR_RISK_POLICY.noticeThreshold;
  const configuredPause = Number.isInteger(source?.pauseThreshold)
    ? source!.pauseThreshold!
    : DEFAULT_DIRECTOR_RISK_POLICY.pauseThreshold;
  return {
    noticeThreshold,
    pauseThreshold: Math.min(
      DIRECTOR_RISK_PAUSE_THRESHOLD_MAX,
      Math.max(DIRECTOR_RISK_PAUSE_THRESHOLD_MIN, noticeThreshold + 1, configuredPause),
    ),
  };
}

export function isDirectorRiskPolicyEndpointUnavailable(error: unknown): boolean {
  return isAxiosError(error) && [404, 405, 501].includes(error.response?.status ?? 0);
}

export async function getDirectorRiskPolicy() {
  const { data } = await apiClient.get<ApiResponse<DirectorRiskPolicyPayload>>("/settings/auto-director/risk-policy");
  return {
    ...data,
    data: normalizeDirectorRiskPolicy(data.data),
  };
}

export async function saveDirectorRiskPolicy(payload: DirectorRiskPolicy) {
  const { data } = await apiClient.put<ApiResponse<DirectorRiskPolicyPayload>>(
    "/settings/auto-director/risk-policy",
    normalizeDirectorRiskPolicy(payload),
  );
  return {
    ...data,
    data: normalizeDirectorRiskPolicy(data.data),
  };
}

export async function getNovelDirectorRiskPolicy(novelId: string) {
  const [novelResponse, globalResponse] = await Promise.all([
    apiClient.get<ApiResponse<DirectorRiskPolicyPayload>>(`/novels/${novelId}/auto-director/risk-policy`),
    getDirectorRiskPolicy(),
  ]);
  const data = novelResponse.data;
  const override = data.data?.override ? normalizeDirectorRiskPolicy(data.data.override) : null;
  const effectivePolicy = override ?? globalResponse.data ?? DEFAULT_DIRECTOR_RISK_POLICY;
  return {
    ...data,
    data: {
      ...effectivePolicy,
      override,
      source: override ? "novel" as const : "global" as const,
    },
  };
}

export async function saveNovelDirectorRiskPolicy(novelId: string, override: DirectorRiskPolicy | null) {
  const { data } = await apiClient.put<ApiResponse<DirectorRiskPolicyPayload>>(
    `/novels/${novelId}/auto-director/risk-policy`,
    { override: override ? normalizeDirectorRiskPolicy(override) : null },
  );
  const nextOverride = data.data?.override ? normalizeDirectorRiskPolicy(data.data.override) : null;
  const globalResponse = await getDirectorRiskPolicy();
  const effectivePolicy = nextOverride ?? globalResponse.data ?? DEFAULT_DIRECTOR_RISK_POLICY;
  return {
    ...data,
    data: {
      ...effectivePolicy,
      override: nextOverride,
      source: nextOverride ? "novel" as const : "global" as const,
    },
  };
}
