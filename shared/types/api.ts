import type { CreativeHubInterrupt, CreativeHubMessage, CreativeHubTurnSummary } from "./creativeHub";
import type { ChapterRuntimePackage } from "./chapterRuntime";

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
  | { type: "runtime_package"; package: ChapterRuntimePackage }
  | {
    type: "run_status";
    runId: string;
    status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
    phase?: "streaming" | "finalizing" | "completed";
    message?: string;
  };

export type CreativeHubStreamFrame =
  | { event: "messages/partial"; data: CreativeHubMessage[] }
  | { event: "messages/complete"; data: CreativeHubMessage[] }
  | { event: "metadata"; data: Record<string, unknown> }
  | { event: "creative_hub/run_status"; data: { runId?: string; status: string; message?: string } }
  | { event: "creative_hub/turn_summary"; data: CreativeHubTurnSummary }
  | { event: "creative_hub/tool_call"; data: { runId?: string; stepId?: string; toolName: string; inputSummary: string } }
  | {
    event: "creative_hub/tool_result";
    data: {
      runId?: string;
      stepId?: string;
      toolName: string;
      outputSummary: string;
      success: boolean;
      output?: Record<string, unknown>;
      errorCode?: string;
    };
  }
  | { event: "creative_hub/interrupt"; data: CreativeHubInterrupt }
  | { event: "creative_hub/approval_resolved"; data: { approvalId: string; action: "approved" | "rejected"; note?: string } }
  | { event: "creative_hub/error"; data: { message: string } }
  | { event: "error"; data: { message: string } };
