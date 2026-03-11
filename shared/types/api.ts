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
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; runId: string; stepId: string; toolName: string; inputSummary: string }
  | { type: "tool_result"; runId: string; stepId: string; toolName: string; outputSummary: string; success: boolean }
  | { type: "approval_required"; runId: string; approvalId: string; summary: string; targetType: string; targetId: string }
  | { type: "approval_resolved"; runId: string; approvalId: string; action: "approved" | "rejected"; note?: string }
  | { type: "run_status"; runId: string; status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled"; message?: string };
