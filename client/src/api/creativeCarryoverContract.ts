import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CreativeCarryoverContract,
  CreativeCarryoverMode,
} from "@ai-novel/shared/types/creativeCarryoverContract";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export type CreativeCarryoverGenerateResult =
  | {
    status: "ready";
    contract: CreativeCarryoverContract;
  }
  | {
    status: "insufficient_material";
    bookAnalysisId: string;
    analysisTitle: string;
    missingSectionTitles: string[];
    sourceVersionReadable: boolean;
  };

export async function generateCreativeCarryoverContract(input: {
  mode: CreativeCarryoverMode;
  bookAnalysisId: string;
  provider?: LLMProvider | string;
  model?: string;
  temperature?: number;
}): Promise<ApiResponse<CreativeCarryoverGenerateResult>> {
  const { data } = await apiClient.post<ApiResponse<CreativeCarryoverGenerateResult>>(
    "/novels/director/creative-carryover-contracts",
    input,
  );
  return data;
}
