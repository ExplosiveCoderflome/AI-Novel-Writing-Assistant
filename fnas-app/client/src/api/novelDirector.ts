import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorCandidatePatchRequest,
  DirectorCandidatePatchResponse,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidateTitleRefineResponse,
  DirectorCandidatesRequest,
  DirectorCandidatesResponse,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorRefineResponse,
  DirectorRefinementRequest,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverRequest,
  DirectorTakeoverResponse,
} from "@ai-novel/shared/types/novelDirector";
import { apiClient } from "./client";

export async function generateDirectorCandidates(payload: DirectorCandidatesRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorCandidatesResponse>>("/novels/director/candidates", payload);
  return data;
}

export async function refineDirectorCandidates(payload: DirectorRefinementRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorRefineResponse>>("/novels/director/refine", payload);
  return data;
}

export async function patchDirectorCandidate(payload: DirectorCandidatePatchRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorCandidatePatchResponse>>("/novels/director/patch-candidate", payload);
  return data;
}

export async function refineDirectorCandidateTitles(payload: DirectorCandidateTitleRefineRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorCandidateTitleRefineResponse>>("/novels/director/refine-titles", payload);
  return data;
}

export async function confirmDirectorCandidate(payload: DirectorConfirmRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorConfirmApiResponse>>("/novels/director/confirm", payload);
  return data;
}

export async function getDirectorTakeoverReadiness(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorTakeoverReadinessResponse>>(`/novels/director/takeover-readiness/${novelId}`);
  return data;
}

export async function startDirectorTakeover(payload: DirectorTakeoverRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorTakeoverResponse>>("/novels/director/takeover", payload);
  return data;
}
