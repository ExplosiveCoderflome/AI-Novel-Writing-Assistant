import type { AgentName, AgentToolName } from "./types";

export interface ApprovalDecision {
  required: boolean;
  summary?: string;
  targetType?: string;
  targetId?: string;
}

const AGENT_TOOL_ALLOWLIST: Record<AgentName, Set<AgentToolName>> = {
  Planner: new Set<AgentToolName>([
    "get_novel_context",
    "list_chapters",
    "get_chapter_by_order",
    "get_chapter_content_by_order",
    "summarize_chapter_range",
    "get_story_bible",
    "get_chapter_content",
    "get_world_constraints",
    "search_knowledge",
    "preview_pipeline_run",
    "queue_pipeline_run",
  ]),
  Writer: new Set<AgentToolName>([
    "get_novel_context",
    "get_chapter_by_order",
    "get_chapter_content_by_order",
    "get_story_bible",
    "get_chapter_content",
    "diff_chapter_patch",
    "save_chapter_draft",
    "apply_chapter_patch",
  ]),
  Reviewer: new Set<AgentToolName>([
    "get_novel_context",
    "list_chapters",
    "get_chapter_by_order",
    "summarize_chapter_range",
    "get_story_bible",
    "get_character_states",
    "get_timeline_facts",
    "get_world_constraints",
    "search_knowledge",
    "get_chapter_content",
  ]),
  Continuity: new Set<AgentToolName>([
    "get_novel_context",
    "list_chapters",
    "get_chapter_by_order",
    "get_chapter_content_by_order",
    "summarize_chapter_range",
    "get_story_bible",
    "get_timeline_facts",
    "get_world_constraints",
    "get_chapter_content",
  ]),
  Repair: new Set<AgentToolName>([
    "get_novel_context",
    "get_chapter_by_order",
    "get_chapter_content_by_order",
    "get_chapter_content",
    "diff_chapter_patch",
    "save_chapter_draft",
    "apply_chapter_patch",
  ]),
};

function toChapterId(input: Record<string, unknown>): string {
  const raw = input.chapterId;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return "unknown";
}

export function canAgentUseTool(agent: AgentName, tool: AgentToolName): boolean {
  return AGENT_TOOL_ALLOWLIST[agent]?.has(tool) ?? false;
}

export function getPermissionMatrixSummary(): string {
  return Object.entries(AGENT_TOOL_ALLOWLIST)
    .map(([agent, tools]) => `${agent}: ${Array.from(tools).join(", ")}`)
    .join("\n");
}

export function evaluateApprovalRequirement(tool: AgentToolName, input: Record<string, unknown>): ApprovalDecision {
  if (tool === "queue_pipeline_run") {
    return {
      required: true,
      summary: "启动小说流水线任务需要确认。",
      targetType: "pipeline",
      targetId: typeof input.novelId === "string" ? input.novelId : "unknown",
    };
  }

  if (tool === "apply_chapter_patch") {
    const fullReplace = input.mode === "full_replace";
    const chapterIds = Array.isArray(input.chapterIds)
      ? input.chapterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const worldRuleChange = typeof input.worldRuleChange === "boolean" ? input.worldRuleChange : false;
    if (fullReplace || chapterIds.length > 1) {
      return {
        required: true,
        summary: fullReplace
          ? "整章覆盖改写需要确认。"
          : "跨章节批量改写需要确认。",
        targetType: "chapter_patch",
        targetId: chapterIds.join(",") || toChapterId(input),
      };
    }
    if (worldRuleChange) {
      return {
        required: true,
        summary: "世界观硬规则变更需要确认。",
        targetType: "world_rule",
        targetId: typeof input.worldId === "string" ? input.worldId : "unknown",
      };
    }
  }

  return {
    required: false,
  };
}
