import type { WorkflowActionDefinition, WorkflowDefinition } from "./workflowTypes";
import { resolveChapterOrder } from "./workflowTypes";

export const generalWorkflowDefinitions: WorkflowDefinition[] = [
  {
    id: "social_opening",
    intent: "social_opening",
    kind: "single",
    resolve: () => [],
  },
  {
    id: "list_novels",
    intent: "list_novels",
    kind: "single",
    resolve: ({ intent }) => [{
      agent: "Planner",
      tool: "list_novels",
      reason: "读取小说列表",
      input: intent.novelTitle ? { query: intent.novelTitle, limit: 10 } : { limit: 10 },
      keyPrefix: intent.novelTitle ? `list_novels_${intent.novelTitle}` : "list_novels",
    }],
  },
  {
    id: "list_base_characters",
    intent: "list_base_characters",
    kind: "single",
    resolve: () => [{
      agent: "Planner",
      tool: "list_base_characters",
      reason: "读取基础角色库列表",
      input: { limit: 20 },
      keyPrefix: "list_base_characters",
    }],
  },
  {
    id: "list_worlds",
    intent: "list_worlds",
    kind: "single",
    resolve: () => [{
      agent: "Planner",
      tool: "list_worlds",
      reason: "读取世界观列表",
      input: { limit: 10 },
      keyPrefix: "list_worlds",
    }],
  },
  {
    id: "query_task_status",
    intent: "query_task_status",
    kind: "single",
    resolve: () => [{
      agent: "Planner",
      tool: "list_tasks",
      reason: "读取当前系统任务状态",
      input: { limit: 10 },
      keyPrefix: "list_tasks",
    }],
  },
  {
    id: "select_novel_workspace",
    intent: "select_novel_workspace",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      if (plannerInput.contextMode === "novel" && plannerInput.novelId) {
        return [{
          agent: "Planner",
          tool: "select_novel_workspace",
          reason: "将当前小说绑定为工作区",
          input: { novelId: plannerInput.novelId },
          keyPrefix: "select_current_novel",
        }];
      }
      return [{
        agent: "Planner",
        tool: "select_novel_workspace",
        reason: intent.novelTitle ? `将《${intent.novelTitle}》设为当前工作区` : "切换当前工作区小说",
        input: intent.novelTitle ? { title: intent.novelTitle } : {},
        keyPrefix: intent.novelTitle ? `select_novel_${intent.novelTitle}` : "select_novel_workspace",
      }];
    },
  },
  {
    id: "query_novel_title",
    intent: "query_novel_title",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_context",
      reason: "读取小说标题信息",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "novel_context_title",
    }],
  },
  {
    id: "query_progress",
    intent: "query_progress",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_production_status",
      reason: "读取小说事实进展",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "novel_fact_progress",
    }],
  },
  {
    id: "inspect_failure_reason",
    intent: "inspect_failure_reason",
    kind: "single",
    resolve: ({ intent, plannerInput }) => {
      const chapterOrder = resolveChapterOrder(intent);
      const actions: WorkflowActionDefinition[] = [];
      if (plannerInput.currentRunId) {
        actions.push({
          agent: "Planner",
          tool: "get_run_failure_reason",
          reason: "读取当前运行失败原因",
          input: { runId: plannerInput.currentRunId },
          keyPrefix: "run_failure_reason",
        });
      }
      if (plannerInput.novelId) {
        actions.push({
          agent: "Planner",
          tool: "explain_generation_blocker",
          reason: chapterOrder != null
            ? `诊断第${chapterOrder}章生成阻塞原因`
            : "诊断当前小说最近一次生成阻塞原因",
          input: chapterOrder != null
            ? { novelId: plannerInput.novelId, chapterOrder, runId: plannerInput.currentRunId }
            : { novelId: plannerInput.novelId, runId: plannerInput.currentRunId },
          keyPrefix: chapterOrder != null ? `generation_blocker_${chapterOrder}` : "generation_blocker",
        });
      }
      return actions;
    },
  },
  {
    id: "inspect_characters",
    intent: "inspect_characters",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Reviewer",
      tool: "get_character_states",
      reason: "读取角色状态",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "character_states",
    }],
  },
  {
    id: "inspect_timeline",
    intent: "inspect_timeline",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Continuity",
      tool: "get_timeline_facts",
      reason: "读取时间线事实",
      input: { novelId: plannerInput.novelId, limit: 30 },
      keyPrefix: "timeline_facts",
    }],
  },
  {
    id: "inspect_world",
    intent: "inspect_world",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Continuity",
      tool: "get_world_constraints",
      reason: "读取世界观规则",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "world_constraints",
    }],
  },
  {
    id: "search_knowledge",
    intent: "search_knowledge",
    kind: "single",
    resolve: ({ intent, plannerInput }) => [{
      agent: "Planner",
      tool: "search_knowledge",
      reason: "执行知识检索",
      input: {
        query: intent.goal,
        ...(plannerInput.novelId ? { novelId: plannerInput.novelId } : {}),
        ...(plannerInput.worldId ? { worldId: plannerInput.worldId } : {}),
      },
      keyPrefix: "knowledge_search",
    }],
  },
  {
    id: "ideate_novel_setup",
    intent: "ideate_novel_setup",
    kind: "workflow",
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_context",
      reason: "读取当前小说概览，作为设定备选的基础信息",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "setup_ideation_context",
    }, {
      agent: "Planner",
      tool: "get_story_bible",
      reason: "读取当前小说圣经，补充已有设定约束",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "setup_ideation_bible",
    }, {
      agent: "Planner",
      tool: "get_world_constraints",
      reason: "读取当前小说绑定世界观的约束信息",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "setup_ideation_world",
    }],
  },
  {
    id: "general_chat",
    intent: "general_chat",
    kind: "single",
    resolve: () => [],
  },
  {
    id: "unknown",
    intent: "unknown",
    kind: "single",
    resolve: () => [],
  },
];
