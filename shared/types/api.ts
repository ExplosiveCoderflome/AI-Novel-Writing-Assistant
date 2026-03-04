export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type SSEFrame =
  | { type: "chunk"; content: string }
  | { type: "done"; fullContent: string }
  | { type: "error"; error: string }
  | { type: "ping" }
  | { type: "reasoning"; content: string };
