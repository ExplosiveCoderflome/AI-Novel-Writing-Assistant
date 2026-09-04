import type { AgentToolName, PlannedAction } from "../agents/types";
import { getAgentToolDefinition } from "../agents/toolRegistry";

const CREATIVE_HUB_ALLOWED_TOOLS = new Set<AgentToolName>([
  "list_novels",
  "list_base_characters",
  "list_worlds",
  "get_novel_production_status",
  "analyze_director_workspace",
  "get_director_run_status",
  "explain_director_next_action",
  "evaluate_manual_edit_impact",
  "get_novel_context",
  "list_chapters",
  "get_chapter_by_order",
  "get_chapter_content_by_order",
  "summarize_chapter_range",
  "get_story_bible",
  "get_chapter_content",
  "get_character_states",
  "get_timeline_facts",
  "get_world_constraints",
  "search_knowledge",
  "list_book_analyses",
  "get_book_analysis_detail",
  "get_book_analysis_failure_reason",
  "list_knowledge_documents",
  "get_knowledge_document_detail",
  "get_index_failure_reason",
  "get_world_detail",
  "explain_world_conflict",
  "audit_chapter_continuity",
  "analyze_quality_debt_attribution",
  "list_writing_formulas",
  "get_writing_formula_detail",
  "explain_formula_match",
  "get_base_character_detail",
  "list_tasks",
  "get_task_detail",
  "get_task_failure_reason",
  "get_run_failure_reason",
  "explain_generation_blocker",
]);

export function isCreativeHubToolAllowed(toolName: AgentToolName): boolean {
  return CREATIVE_HUB_ALLOWED_TOOLS.has(toolName) && ["read", "inspect"].includes(getAgentToolDefinition(toolName).category);
}

export function filterCreativeHubActions(actions: PlannedAction[]): {
  allowedActions: PlannedAction[];
  blockedTools: AgentToolName[];
} {
  const blockedTools = new Set<AgentToolName>();
  const allowedActions = actions.filter((action) => {
    const blocked = action.calls.filter((call) => !isCreativeHubToolAllowed(call.tool));
    if (blocked.length === 0) return true;
    blocked.forEach((call) => blockedTools.add(call.tool));
    return false;
  });

  return { allowedActions, blockedTools: [...blockedTools] };
}

export function getBlockedCreativeHubTools(actions: PlannedAction[]): AgentToolName[] {
  return filterCreativeHubActions(actions).blockedTools;
}
