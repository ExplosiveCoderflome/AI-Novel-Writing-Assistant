import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorCandidatesRequest,
  DirectorCandidatesResponse,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorRefineResponse,
  DirectorRefinementRequest,
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

export async function confirmDirectorCandidate(payload: DirectorConfirmRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorConfirmApiResponse>>("/novels/director/confirm", payload);
  return data;
}
