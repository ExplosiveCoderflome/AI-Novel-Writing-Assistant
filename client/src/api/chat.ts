import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface ChatMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function getChatHistory() {
  const { data } = await apiClient.get<ApiResponse<unknown[]>>("/chat/history");
  return data;
}
