import type { AgentApproval, AgentRun, AgentStep } from "@ai-novel/shared/types/agent";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AgentPlan, AgentToolErrorCode } from "@ai-novel/shared/types/agent";

export type AgentName = "Planner" | "Writer" | "Reviewer" | "Continuity" | "Repair";

export type AgentToolName =
  | "get_novel_context"
  | "get_story_bible"
  | "get_chapter_content"
  | "get_character_states"
  | "get_timeline_facts"
  | "get_world_constraints"
  | "search_knowledge"
  | "diff_chapter_patch"
  | "preview_pipeline_run"
  | "save_chapter_draft"
  | "apply_chapter_patch"
  | "queue_pipeline_run";

export type AgentContextMode = "global" | "novel";

export interface AgentRunStartInput {
  runId?: string;
  sessionId: string;
  goal: string;
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  contextMode: AgentContextMode;
  novelId?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentApprovalDecisionInput {
  runId: string;
  approvalId: string;
  action: "approve" | "reject";
  note?: string;
}

export interface AgentRuntimeCallbacks {
  onReasoning?: (content: string) => void;
  onToolCall?: (payload: { runId: string; stepId: string; toolName: AgentToolName; inputSummary: string }) => void;
  onToolResult?: (payload: {
    runId: string;
    stepId: string;
    toolName: AgentToolName;
    outputSummary: string;
    success: boolean;
  }) => void;
  onApprovalRequired?: (payload: {
    runId: string;
    approvalId: string;
    summary: string;
    targetType: string;
    targetId: string;
  }) => void;
  onApprovalResolved?: (payload: { runId: string; approvalId: string; action: "approved" | "rejected"; note?: string }) => void;
  onRunStatus?: (payload: {
    runId: string;
    status: AgentRun["status"];
    message?: string;
  }) => void;
}

export interface AgentRuntimeResult {
  run: AgentRun;
  steps: AgentStep[];
  approvals: AgentApproval[];
  assistantOutput: string;
}

export interface ToolExecutionContext {
  runId: string;
  agentName: AgentName;
  contextMode: AgentContextMode;
  novelId?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  dryRun?: boolean;
}

export interface ToolCall {
  tool: AgentToolName;
  idempotencyKey: string;
  input: Record<string, unknown>;
  reason: string;
  dryRun?: boolean;
}

export interface PlannedAction {
  agent: AgentName;
  reasoning: string;
  calls: ToolCall[];
}

export interface PlannerInput {
  goal: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  contextMode: AgentContextMode;
  novelId?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  currentRunStatus?: AgentRun["status"];
}

export interface PlannerResult {
  plan: AgentPlan;
  actions: PlannedAction[];
  source: "llm" | "fallback";
  validationWarnings: string[];
}

export class AgentToolError extends Error {
  readonly code: AgentToolErrorCode;

  constructor(code: AgentToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentToolError";
  }
}
