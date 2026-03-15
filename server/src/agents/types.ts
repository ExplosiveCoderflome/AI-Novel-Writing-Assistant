import type { AgentApproval, AgentRun, AgentStep } from "@ai-novel/shared/types/agent";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AgentPlan, AgentToolErrorCode } from "@ai-novel/shared/types/agent";

export type AgentName = "Planner" | "Writer" | "Reviewer" | "Continuity" | "Repair";

export type AgentToolName =
  | "list_novels"
  | "create_novel"
  | "select_novel_workspace"
  | "bind_world_to_novel"
  | "unbind_world_from_novel"
  | "generate_world_for_novel"
  | "generate_novel_characters"
  | "generate_story_bible"
  | "generate_novel_outline"
  | "generate_structured_outline"
  | "sync_chapters_from_structured_outline"
  | "start_full_novel_pipeline"
  | "get_novel_production_status"
  | "get_novel_context"
  | "list_chapters"
  | "get_chapter_by_order"
  | "get_chapter_content_by_order"
  | "summarize_chapter_range"
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
  | "queue_pipeline_run"
  | "list_book_analyses"
  | "get_book_analysis_detail"
  | "get_book_analysis_failure_reason"
  | "list_knowledge_documents"
  | "get_knowledge_document_detail"
  | "get_index_failure_reason"
  | "list_worlds"
  | "get_world_detail"
  | "explain_world_conflict"
  | "list_writing_formulas"
  | "get_writing_formula_detail"
  | "explain_formula_match"
  | "list_base_characters"
  | "get_base_character_detail"
  | "list_tasks"
  | "get_task_detail"
  | "get_task_failure_reason"
  | "get_run_failure_reason"
  | "retry_task"
  | "cancel_task"
  | "explain_generation_blocker";

export type AgentContextMode = "global" | "novel";

export type AgentIntentName =
  | "list_novels"
  | "list_base_characters"
  | "list_worlds"
  | "query_task_status"
  | "create_novel"
  | "select_novel_workspace"
  | "bind_world_to_novel"
  | "unbind_world_from_novel"
  | "produce_novel"
  | "query_novel_production_status"
  | "query_novel_title"
  | "query_chapter_content"
  | "query_progress"
  | "inspect_failure_reason"
  | "write_chapter"
  | "rewrite_chapter"
  | "save_chapter_draft"
  | "start_pipeline"
  | "inspect_characters"
  | "inspect_timeline"
  | "inspect_world"
  | "search_knowledge"
  | "ideate_novel_setup"
  | "general_chat"
  | "unknown";

export interface StructuredIntent {
  goal: string;
  intent: AgentIntentName;
  confidence: number;
  requiresNovelContext: boolean;
  novelTitle?: string;
  worldName?: string;
  description?: string;
  targetChapterCount?: number;
  genre?: string;
  worldType?: string;
  styleTone?: string;
  projectMode?: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  pacePreference?: "fast" | "balanced" | "slow";
  narrativePov?: "first_person" | "third_person" | "mixed";
  emotionIntensity?: "low" | "medium" | "high";
  aiFreedom?: "low" | "medium" | "high";
  defaultChapterLength?: number;
  chapterSelectors: {
    chapterId?: string;
    orders?: number[];
    range?: {
      startOrder: number;
      endOrder: number;
    };
    relative?: {
      type: "first_n";
      count: number;
    };
  };
  content?: string;
  note?: string;
}

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
  worldId?: string;
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
    output?: Record<string, unknown>;
    errorCode?: AgentToolErrorCode;
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
  worldId?: string;
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
  approvalSatisfied?: boolean;
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
  worldId?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  currentRunStatus?: AgentRun["status"];
  currentStep?: string;
  currentRunId?: string;
}

export interface PlannerResult {
  structuredIntent: StructuredIntent;
  plan: AgentPlan;
  actions: PlannedAction[];
  source: "llm";
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
