import type { AgentPlan } from "@ai-novel/shared/types/agent";
import type { AgentName, PlannerInput, StructuredIntent } from "../../agents/types";

export interface WorkflowActionDefinition {
  agent: AgentName;
  tool: AgentPlan["actions"][number]["tool"];
  reason: string;
  input: Record<string, unknown>;
  keyPrefix: string;
}

export interface WorkflowDefinition {
  id: string;
  intent: StructuredIntent["intent"];
  kind: "single" | "workflow";
  requiresNovelContext?: boolean;
  resolve: (input: { intent: StructuredIntent; plannerInput: PlannerInput }) => WorkflowActionDefinition[];
}

export interface WorkflowResolution {
  definition: WorkflowDefinition;
  actions: WorkflowActionDefinition[];
  holdForCollaboration: boolean;
}

const EXECUTION_FIRST_INTENTS = new Set<StructuredIntent["intent"]>([
  "create_novel",
  "bind_world_to_novel",
  "unbind_world_from_novel",
  "produce_novel",
  "write_chapter",
  "rewrite_chapter",
  "save_chapter_draft",
  "start_pipeline",
]);

function resolveChapterOrder(intent: StructuredIntent): number | null {
  const directOrder = intent.chapterSelectors.orders?.[0];
  if (typeof directOrder === "number") {
    return directOrder;
  }
  if (intent.chapterSelectors.range) {
    return intent.chapterSelectors.range.startOrder;
  }
  return null;
}

const workflowDefinitions: Record<StructuredIntent["intent"], WorkflowDefinition> = {
  social_opening: {
    id: "social_opening",
    intent: "social_opening",
    kind: "single",
    resolve: () => [],
  },
  list_novels: {
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
  list_base_characters: {
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
  list_worlds: {
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
  query_task_status: {
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
  create_novel: {
    id: "create_novel",
    intent: "create_novel",
    kind: "workflow",
    resolve: ({ intent }) => intent.novelTitle
      ? [{
        agent: "Planner",
        tool: "create_novel",
        reason: `创建小说《${intent.novelTitle}》`,
        input: { title: intent.novelTitle },
        keyPrefix: `create_novel_${intent.novelTitle}`,
      }]
      : [],
  },
  select_novel_workspace: {
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
  bind_world_to_novel: {
    id: "bind_world_to_novel",
    intent: "bind_world_to_novel",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => plannerInput.novelId && intent.worldName
      ? [{
        agent: "Planner",
        tool: "bind_world_to_novel",
        reason: `将《${intent.worldName}》绑定为当前小说世界观`,
        input: {
          novelId: plannerInput.novelId,
          worldName: intent.worldName,
        },
        keyPrefix: `bind_world_${intent.worldName}`,
      }]
      : [],
  },
  unbind_world_from_novel: {
    id: "unbind_world_from_novel",
    intent: "unbind_world_from_novel",
    kind: "workflow",
    resolve: ({ plannerInput }) => plannerInput.novelId
      ? [{
        agent: "Planner",
        tool: "unbind_world_from_novel",
        reason: "解除当前小说的世界观绑定",
        input: {
          novelId: plannerInput.novelId,
        },
        keyPrefix: "unbind_world",
      }]
      : [],
  },
  produce_novel: {
    id: "produce_novel",
    intent: "produce_novel",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const hasCurrentNovel = Boolean(plannerInput.novelId);
      if (!hasCurrentNovel && !intent.novelTitle) {
        return [];
      }

      const actions: WorkflowActionDefinition[] = [];

      if (!hasCurrentNovel && intent.novelTitle) {
        const createNovelInput: Record<string, unknown> = {
          title: intent.novelTitle,
        };
        if (intent.description) createNovelInput.description = intent.description;
        if (intent.genre) createNovelInput.genre = intent.genre;
        if (intent.styleTone) createNovelInput.styleTone = intent.styleTone;
        if (intent.projectMode) createNovelInput.projectMode = intent.projectMode;
        if (intent.pacePreference) createNovelInput.pacePreference = intent.pacePreference;
        if (intent.narrativePov) createNovelInput.narrativePov = intent.narrativePov;
        if (intent.emotionIntensity) createNovelInput.emotionIntensity = intent.emotionIntensity;
        if (intent.aiFreedom) createNovelInput.aiFreedom = intent.aiFreedom;
        if (typeof intent.defaultChapterLength === "number") createNovelInput.defaultChapterLength = intent.defaultChapterLength;

        actions.push({
          agent: "Planner",
          tool: "create_novel",
          reason: `创建小说《${intent.novelTitle}》`,
          input: createNovelInput,
          keyPrefix: `produce_create_${intent.novelTitle}`,
        });
      }

      if (!plannerInput.worldId) {
        actions.push({
          agent: "Planner",
          tool: "generate_world_for_novel",
          reason: "为当前小说生成世界观",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
            ...(intent.worldType ? { worldType: intent.worldType } : {}),
          },
          keyPrefix: "produce_world",
        });
        actions.push({
          agent: "Planner",
          tool: "bind_world_to_novel",
          reason: "将生成的世界观绑定到当前小说",
          input: {},
          keyPrefix: "produce_bind_world",
        });
      }

      actions.push(
        {
          agent: "Planner",
          tool: "generate_novel_characters",
          reason: "生成核心角色设定",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
            ...(intent.genre ? { genre: intent.genre } : {}),
            ...(intent.styleTone ? { styleTone: intent.styleTone } : {}),
            ...(intent.narrativePov ? { narrativePov: intent.narrativePov } : {}),
          },
          keyPrefix: "produce_characters",
        },
        {
          agent: "Planner",
          tool: "generate_story_bible",
          reason: "生成小说圣经",
          input: {},
          keyPrefix: "produce_bible",
        },
        {
          agent: "Planner",
          tool: "generate_novel_outline",
          reason: "生成发展走向",
          input: {
            ...(intent.description ? { description: intent.description } : {}),
          },
          keyPrefix: "produce_outline",
        },
        {
          agent: "Planner",
          tool: "generate_structured_outline",
          reason: "生成结构化大纲",
          input: {
            targetChapterCount: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_structured_outline",
        },
        {
          agent: "Planner",
          tool: "sync_chapters_from_structured_outline",
          reason: "根据结构化大纲同步章节目录",
          input: {},
          keyPrefix: "produce_sync_chapters",
        },
        {
          agent: "Planner",
          tool: "preview_pipeline_run",
          reason: "预览整本写作范围",
          input: {
            startOrder: 1,
            endOrder: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_preview_pipeline",
        },
        {
          agent: "Planner",
          tool: "queue_pipeline_run",
          reason: "启动整本写作任务",
          input: {
            startOrder: 1,
            endOrder: intent.targetChapterCount ?? 20,
          },
          keyPrefix: "produce_queue_pipeline",
        },
      );

      return actions;
    },
  },
  query_novel_production_status: {
    id: "query_novel_production_status",
    intent: "query_novel_production_status",
    kind: "single",
    resolve: ({ intent, plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_production_status",
      reason: "读取整本生产状态",
      input: {
        ...(plannerInput.novelId ? { novelId: plannerInput.novelId } : {}),
        ...(intent.novelTitle ? { title: intent.novelTitle } : {}),
        ...(intent.targetChapterCount ? { targetChapterCount: intent.targetChapterCount } : {}),
      },
      keyPrefix: intent.novelTitle ? `production_status_${intent.novelTitle}` : "production_status",
    }],
  },
  analyze_director_workspace: {
    id: "analyze_director_workspace",
    intent: "analyze_director_workspace",
    kind: "single",
    requiresNovelContext: true,
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "analyze_director_workspace",
      reason: "通过自动导演运行时分析当前小说工作区",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "director_workspace_analysis",
    }],
  },
  query_director_status: {
    id: "query_director_status",
    intent: "query_director_status",
    kind: "single",
    requiresNovelContext: true,
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "get_director_run_status",
      reason: "读取自动导演运行状态",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "director_run_status",
    }],
  },
  explain_director_next_action: {
    id: "explain_director_next_action",
    intent: "explain_director_next_action",
    kind: "single",
    requiresNovelContext: true,
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "explain_director_next_action",
      reason: "解释当前小说的自动导演下一步建议",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "director_next_action",
    }],
  },
  run_director_next_step: {
    id: "run_director_next_step",
    intent: "run_director_next_step",
    kind: "workflow",
    requiresNovelContext: true,
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "run_director_next_step",
      reason: "请求自动导演继续推进下一步",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "director_run_next_step",
    }],
  },
  run_director_until_gate: {
    id: "run_director_until_gate",
    intent: "run_director_until_gate",
    kind: "workflow",
    requiresNovelContext: true,
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "run_director_until_gate",
      reason: "请求自动导演推进到下一个检查点",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "director_run_until_gate",
    }],
  },
  switch_director_policy: {
    id: "switch_director_policy",
    intent: "switch_director_policy",
    kind: "workflow",
    requiresNovelContext: true,
    resolve: ({ intent, plannerInput }) => [{
      agent: "Planner",
      tool: "switch_director_policy",
      reason: "切换自动导演推进策略",
      input: {
        novelId: plannerInput.novelId,
        mode: intent.directorPolicyMode ?? "run_next_step",
        ...(typeof intent.mayOverwriteUserContent === "boolean"
          ? { mayOverwriteUserContent: intent.mayOverwriteUserContent }
          : {}),
        ...(typeof intent.allowExpensiveReview === "boolean"
          ? { allowExpensiveReview: intent.allowExpensiveReview }
          : {}),
        ...(intent.modelTier ? { modelTier: intent.modelTier } : {}),
      },
      keyPrefix: `director_policy_${intent.directorPolicyMode ?? "run_next_step"}`,
    }],
  },
  evaluate_manual_edit_impact: {
    id: "evaluate_manual_edit_impact",
    intent: "evaluate_manual_edit_impact",
    kind: "single",
    requiresNovelContext: true,
    resolve: ({ intent, plannerInput }) => [{
      agent: "Planner",
      tool: "evaluate_manual_edit_impact",
      reason: "评估手动编辑对自动导演后续推进的影响",
      input: {
        novelId: plannerInput.novelId,
        ...(intent.chapterSelectors.chapterId ? { chapterId: intent.chapterSelectors.chapterId } : {}),
      },
      keyPrefix: intent.chapterSelectors.chapterId
        ? `manual_edit_impact_${intent.chapterSelectors.chapterId}`
        : "manual_edit_impact",
    }],
  },
  query_novel_title: {
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
  query_chapter_content: {
    id: "query_chapter_content",
    intent: "query_chapter_content",
    kind: "single",
    resolve: ({ intent, plannerInput }) => {
      const range = intent.chapterSelectors.range;
      const relativeFirstN = intent.chapterSelectors.relative?.type === "first_n"
        ? intent.chapterSelectors.relative.count
        : null;

      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);

      if (normalizedOrders.length > 0) {
        return normalizedOrders.slice(0, 5).map((order) => ({
          agent: "Planner",
          tool: "get_chapter_content_by_order",
          reason: `读取第${order}章正文`,
          input: { novelId: plannerInput.novelId, chapterOrder: order },
          keyPrefix: `chapter_${order}`,
        }));
      }
      if (range) {
        return [{
          agent: "Planner",
          tool: "summarize_chapter_range",
          reason: "按章节范围汇总内容",
          input: { novelId: plannerInput.novelId, startOrder: range.startOrder, endOrder: range.endOrder, mode: "summary" },
          keyPrefix: `chapter_range_${range.startOrder}_${range.endOrder}`,
        }];
      }
      if (relativeFirstN != null) {
        return [{
          agent: "Planner",
          tool: "summarize_chapter_range",
          reason: "按前 N 章汇总内容",
          input: { novelId: plannerInput.novelId, startOrder: 1, endOrder: relativeFirstN, mode: "summary" },
          keyPrefix: `chapter_first_n_${relativeFirstN}`,
        }];
      }
      if (intent.chapterSelectors.chapterId) {
        return [{
          agent: "Planner",
          tool: "get_chapter_content",
          reason: "按章节 ID 读取正文",
          input: { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId },
          keyPrefix: "chapter_content_by_id",
        }];
      }
      return [{
        agent: "Planner",
        tool: "get_novel_context",
        reason: "读取小说上下文，辅助定位章节",
        input: { novelId: plannerInput.novelId },
        keyPrefix: "context_for_chapter_query",
      }];
    },
  },
  query_progress: {
    id: "query_progress",
    intent: "query_progress",
    kind: "single",
    resolve: ({ plannerInput }) => [{
      agent: "Planner",
      tool: "get_novel_context",
      reason: "读取小说进度信息",
      input: { novelId: plannerInput.novelId },
      keyPrefix: "novel_progress",
    }],
  },
  inspect_failure_reason: {
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
  write_chapter: {
    id: "write_chapter",
    intent: "write_chapter",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      if (!plannerInput.novelId) {
        return [];
      }
      const range = intent.chapterSelectors.range
        ? {
          startOrder: Math.min(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
          endOrder: Math.max(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
        }
        : null;
      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);
      const resolvedRange = range
        ?? (normalizedOrders.length > 0
          ? { startOrder: normalizedOrders[0], endOrder: normalizedOrders[normalizedOrders.length - 1] }
          : null);
      const startOrder = resolvedRange?.startOrder ?? 1;
      const endOrder = resolvedRange?.endOrder ?? startOrder;
      return [{
        agent: "Planner",
        tool: "preview_pipeline_run",
        reason: "预览写作范围",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `preview_${startOrder}_${endOrder}`,
      }, {
        agent: "Planner",
        tool: "queue_pipeline_run",
        reason: "创建写作流水线任务",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `queue_${startOrder}_${endOrder}`,
      }];
    },
  },
  rewrite_chapter: {
    id: "rewrite_chapter",
    intent: "rewrite_chapter",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const order = resolveChapterOrder(intent);
      if (plannerInput.novelId && order != null) {
        return [
          {
            agent: "Planner",
            tool: "get_chapter_content_by_order",
            reason: "读取待改写章节正文",
            input: { novelId: plannerInput.novelId, chapterOrder: order },
            keyPrefix: `rewrite_read_${order}`,
          },
          {
            agent: "Planner",
            tool: "preview_pipeline_run",
            reason: `重写第${order}章预览`,
            input: { novelId: plannerInput.novelId, startOrder: order, endOrder: order },
            keyPrefix: `rewrite_preview_${order}`,
          },
          {
            agent: "Planner",
            tool: "queue_pipeline_run",
            reason: `重写第${order}章执行`,
            input: { novelId: plannerInput.novelId, startOrder: order, endOrder: order },
            keyPrefix: `rewrite_queue_${order}`,
          },
        ];
      }
      if (intent.chapterSelectors.chapterId) {
        return [{
          agent: "Planner",
          tool: "get_chapter_content",
          reason: "读取待改写章节正文",
          input: { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId },
          keyPrefix: "rewrite_read_by_id",
        }];
      }
      return [];
    },
  },
  save_chapter_draft: {
    id: "save_chapter_draft",
    intent: "save_chapter_draft",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      const order = resolveChapterOrder(intent);
      if (!plannerInput.novelId || (!intent.chapterSelectors.chapterId && order == null) || !intent.content) {
        return [];
      }
      return [{
        agent: "Writer",
        tool: "save_chapter_draft",
        reason: "保存章节草稿",
        input: intent.chapterSelectors.chapterId
          ? { novelId: plannerInput.novelId, chapterId: intent.chapterSelectors.chapterId, content: intent.content }
          : { novelId: plannerInput.novelId, chapterOrder: order, content: intent.content },
        keyPrefix: "save_draft",
      }];
    },
  },
  start_pipeline: {
    id: "start_pipeline",
    intent: "start_pipeline",
    kind: "workflow",
    resolve: ({ intent, plannerInput }) => {
      if (!plannerInput.novelId) {
        return [];
      }
      const range = intent.chapterSelectors.range
        ? {
          startOrder: Math.min(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
          endOrder: Math.max(intent.chapterSelectors.range.startOrder, intent.chapterSelectors.range.endOrder),
        }
        : null;
      const normalizedOrders = (intent.chapterSelectors.orders ?? [])
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.trunc(order)))
        .filter((order, index, list) => list.indexOf(order) === index)
        .sort((left, right) => left - right);
      const resolvedRange = range
        ?? (normalizedOrders.length > 0
          ? { startOrder: normalizedOrders[0], endOrder: normalizedOrders[normalizedOrders.length - 1] }
          : null);
      const startOrder = resolvedRange?.startOrder ?? 1;
      const endOrder = resolvedRange?.endOrder ?? startOrder;
      return [{
        agent: "Planner",
        tool: "preview_pipeline_run",
        reason: "预览写作范围",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `preview_${startOrder}_${endOrder}`,
      }, {
        agent: "Planner",
        tool: "queue_pipeline_run",
        reason: "创建写作流水线任务",
        input: { novelId: plannerInput.novelId, startOrder, endOrder },
        keyPrefix: `queue_${startOrder}_${endOrder}`,
      }];
    },
  },
  inspect_characters: {
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
  inspect_timeline: {
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
  inspect_world: {
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
  search_knowledge: {
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
  ideate_novel_setup: {
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
  general_chat: {
    id: "general_chat",
    intent: "general_chat",
    kind: "single",
    resolve: () => [],
  },
  unknown: {
    id: "unknown",
    intent: "unknown",
    kind: "single",
    resolve: () => [],
  },
};

export function listWorkflowDefinitions(): WorkflowDefinition[] {
  return Object.values(workflowDefinitions);
}

export function resolveWorkflow(intent: StructuredIntent, plannerInput: PlannerInput): WorkflowResolution {
  const definition = workflowDefinitions[intent.intent] ?? workflowDefinitions.unknown;
  const holdForCollaboration = EXECUTION_FIRST_INTENTS.has(intent.intent)
    && (Boolean(intent.shouldAskFollowup) || (intent.interactionMode ?? "execute") !== "execute");

  if (holdForCollaboration) {
    return {
      definition,
      actions: [],
      holdForCollaboration,
    };
  }

  if (definition.requiresNovelContext && plannerInput.contextMode === "novel" && !plannerInput.novelId) {
    return {
      definition,
      actions: [],
      holdForCollaboration: false,
    };
  }

  return {
    definition,
    actions: definition.resolve({ intent, plannerInput }),
    holdForCollaboration,
  };
}
