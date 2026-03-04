import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { WritingFormula } from "@ai-novel/shared/types/writingFormula";
import { apiClient } from "./client";

export async function getWritingFormulas() {
  const { data } = await apiClient.get<ApiResponse<WritingFormula[]>>("/writing-formula");
  return data;
}

export async function getWritingFormulaDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<WritingFormula>>(`/writing-formula/${id}`);
  return data;
}

export async function deleteWritingFormula(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/writing-formula/${id}`);
  return data;
}
