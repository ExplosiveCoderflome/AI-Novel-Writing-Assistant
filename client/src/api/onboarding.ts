import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CompleteQuickSetupRequest,
  CompleteQuickSetupResult,
  FirstNovelOnboardingProjection,
  QuickSetupStatus,
} from "@ai-novel/shared/types/onboarding";
import { apiClient } from "./client";

export async function getQuickSetupStatus() {
  const { data } = await apiClient.get<ApiResponse<QuickSetupStatus>>("/settings/quick-setup/status");
  return data;
}

export async function completeQuickSetup(payload: CompleteQuickSetupRequest) {
  const { data } = await apiClient.post<ApiResponse<CompleteQuickSetupResult>>(
    "/settings/quick-setup/complete",
    payload,
  );
  return data;
}

export async function getFirstNovelOnboarding() {
  const { data } = await apiClient.get<ApiResponse<FirstNovelOnboardingProjection>>("/onboarding/first-novel");
  return data;
}
