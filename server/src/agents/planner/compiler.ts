import type { AgentPlan } from "@ai-novel/shared/types/agent";
import type { AgentName, PlannedAction, PlannerInput, StructuredIntent, ToolCall } from "../types";
import { buildIdempotencyKey, normalizeOrders, slug } from "./utils";

function toolAction(
  agent: AgentName,
  tool: AgentPlan["actions"][number]["tool"],
  reason: string,
  input: Record<string, unknown>,
  keyPrefix: string,
  plannerInput: PlannerInput,
): AgentPlan["actions"][number] {
  return {
    agent,
    tool,
    reason,
    idempotencyKey: buildIdempotencyKey(keyPrefix, plannerInput),
    input,
  };
}

export function compileIntentToPlan(parsed: StructuredIntent, input: PlannerInput): AgentPlan {
  const actions: AgentPlan["actions"] = [];
  const contextNeeds: AgentPlan["contextNeeds"] = [];
  const normalizedOrders = normalizeOrders(parsed.chapterSelectors.orders);
  const range = parsed.chapterSelectors.range
    ? {
      startOrder: Math.min(parsed.chapterSelectors.range.startOrder, parsed.chapterSelectors.range.endOrder),
      endOrder: Math.max(parsed.chapterSelectors.range.startOrder, parsed.chapterSelectors.range.endOrder),
    }
    : null;
  const relativeFirstN = parsed.chapterSelectors.relative?.type === "first_n"
    ? parsed.chapterSelectors.relative.count
    : null;
  const chapterId = parsed.chapterSelectors.chapterId;
  const hasRelativeSummary = relativeFirstN != null;
  const hasRangeSummary = Boolean(range);

  function addSingleChapterPipeline(order: number, keyPrefix: string, reasonPrefix: string) {
    actions.push(toolAction(
      "Planner",
      "preview_pipeline_run",
      `${reasonPrefix}预览`,
      { novelId: input.novelId, startOrder: order, endOrder: order },
      `${keyPrefix}_preview_${order}`,
      input,
    ));
    actions.push(toolAction(
      "Planner",
      "queue_pipeline_run",
      `${reasonPrefix}执行`,
      { novelId: input.novelId, startOrder: order, endOrder: order },
      `${keyPrefix}_queue_${order}`,
      input,
    ));
  }

  if (input.contextMode === "novel" && input.novelId) {
    contextNeeds.push({
      key: "novel_context",
      required: true,
      reason: "当前问题绑定小说上下文。",
    });
  } else {
    contextNeeds.push({
      key: "global_context",
      required: true,
      reason: "当前问题使用全局上下文。",
    });
  }

  switch (parsed.intent) {
    case "query_novel_title":
    case "query_progress": {
      if (input.novelId) {
        actions.push(toolAction(
          "Planner",
          "get_novel_context",
          parsed.intent === "query_progress" ? "读取小说进度信息" : "读取小说标题信息",
          { novelId: input.novelId },
          parsed.intent,
          input,
        ));
      }
      break;
    }
    case "query_chapter_content": {
      if (input.novelId) {
        if (normalizedOrders.length > 0) {
          for (const order of normalizedOrders.slice(0, 5)) {
            actions.push(toolAction(
              "Planner",
              "get_chapter_content_by_order",
              `读取第${order}章正文`,
              { novelId: input.novelId, chapterOrder: order },
              `chapter_${order}`,
              input,
            ));
          }
        } else if (hasRangeSummary && range) {
          actions.push(toolAction(
            "Planner",
            "summarize_chapter_range",
            `总结第${range.startOrder}到第${range.endOrder}章`,
            { novelId: input.novelId, startOrder: range.startOrder, endOrder: range.endOrder, mode: "summary" },
            `range_${range.startOrder}_${range.endOrder}`,
            input,
          ));
        } else if (hasRelativeSummary && relativeFirstN != null) {
          actions.push(toolAction(
            "Planner",
            "summarize_chapter_range",
            `总结前${relativeFirstN}章`,
            { novelId: input.novelId, startOrder: 1, endOrder: relativeFirstN, mode: "summary" },
            `first_${relativeFirstN}`,
            input,
          ));
        } else if (chapterId) {
          actions.push(toolAction(
            "Planner",
            "get_chapter_content",
            "按章节 ID 读取正文",
            { novelId: input.novelId, chapterId },
            `chapter_id_${chapterId}`,
            input,
          ));
        } else {
          actions.push(toolAction(
            "Planner",
            "get_novel_context",
            "读取小说上下文，辅助定位章节",
            { novelId: input.novelId },
            "context_for_chapter_query",
            input,
          ));
        }
      }
      break;
    }
    case "inspect_failure_reason": {
      if (input.currentRunId) {
        actions.push(toolAction(
          "Planner",
          "get_run_failure_reason",
          "读取当前运行失败原因",
          { runId: input.currentRunId },
          "run_failure_reason",
          input,
        ));
      }
      if (input.novelId) {
        const chapterOrder = normalizedOrders[0] ?? range?.startOrder;
        actions.push(toolAction(
          "Planner",
          "explain_generation_blocker",
          chapterOrder != null
            ? `诊断第${chapterOrder}章生成阻塞原因`
            : "诊断当前小说最近一次生成阻塞原因",
          chapterOrder != null
            ? { novelId: input.novelId, chapterOrder, runId: input.currentRunId }
            : { novelId: input.novelId, runId: input.currentRunId },
          chapterOrder != null ? `generation_blocker_${chapterOrder}` : "generation_blocker",
          input,
        ));
      }
      break;
    }
    case "write_chapter":
    case "start_pipeline": {
      if (input.novelId) {
        const resolvedRange = range
          ?? (normalizedOrders.length > 0 ? { startOrder: normalizedOrders[0], endOrder: normalizedOrders[normalizedOrders.length - 1] } : null);
        const startOrder = resolvedRange?.startOrder ?? 1;
        const endOrder = resolvedRange?.endOrder ?? startOrder;
        actions.push(toolAction(
          "Planner",
          "preview_pipeline_run",
          "预览写作范围",
          { novelId: input.novelId, startOrder, endOrder },
          `preview_${startOrder}_${endOrder}`,
          input,
        ));
        actions.push(toolAction(
          "Planner",
          "queue_pipeline_run",
          "创建写作流水线任务",
          { novelId: input.novelId, startOrder, endOrder },
          `queue_${startOrder}_${endOrder}`,
          input,
        ));
      }
      break;
    }
    case "rewrite_chapter": {
      if (input.novelId && normalizedOrders[0]) {
        const order = normalizedOrders[0];
        actions.push(toolAction(
          "Planner",
          "get_chapter_content_by_order",
          "读取待改写章节正文",
          { novelId: input.novelId, chapterOrder: order },
          `rewrite_read_${order}`,
          input,
        ));
        addSingleChapterPipeline(order, "rewrite", `重写第${order}章`);
      } else if (input.novelId && chapterId) {
        actions.push(toolAction(
          "Planner",
          "get_chapter_content",
          "读取待改写章节正文",
          { novelId: input.novelId, chapterId },
          "rewrite_read_by_id",
          input,
        ));
      }
      break;
    }
    case "save_chapter_draft": {
      if (input.novelId && (chapterId || normalizedOrders[0]) && parsed.content) {
        actions.push(toolAction(
          "Writer",
          "save_chapter_draft",
          "保存章节草稿",
          chapterId
            ? { novelId: input.novelId, chapterId, content: parsed.content }
            : { novelId: input.novelId, chapterOrder: normalizedOrders[0], content: parsed.content },
          "save_draft",
          input,
        ));
      }
      break;
    }
    case "inspect_characters": {
      if (input.novelId) {
        actions.push(toolAction(
          "Reviewer",
          "get_character_states",
          "读取角色状态",
          { novelId: input.novelId },
          "character_states",
          input,
        ));
      }
      break;
    }
    case "inspect_timeline": {
      if (input.novelId) {
        actions.push(toolAction(
          "Continuity",
          "get_timeline_facts",
          "读取时间线事实",
          { novelId: input.novelId, limit: 30 },
          "timeline_facts",
          input,
        ));
      }
      break;
    }
    case "inspect_world": {
      if (input.novelId) {
        actions.push(toolAction(
          "Continuity",
          "get_world_constraints",
          "读取世界观规则",
          { novelId: input.novelId },
          "world_constraints",
          input,
        ));
      }
      break;
    }
    case "search_knowledge":
    case "general_chat":
    case "unknown":
    default: {
      actions.push(toolAction(
        "Planner",
        "search_knowledge",
        "执行知识检索",
        { query: parsed.goal, novelId: input.novelId },
        "knowledge_search",
        input,
      ));
      break;
    }
  }

  const uniqueActions = actions.filter((action, index) => {
    const fingerprint = `${action.tool}:${JSON.stringify(action.input)}`;
    return actions.findIndex((candidate) => `${candidate.tool}:${JSON.stringify(candidate.input)}` === fingerprint) === index;
  });

  return {
    goal: parsed.goal,
    contextNeeds,
    actions: uniqueActions,
    riskLevel: uniqueActions.some((item) => item.tool === "apply_chapter_patch" || item.tool === "queue_pipeline_run")
      ? "high"
      : uniqueActions.length > 0
        ? "medium"
        : "low",
    requiresApproval: uniqueActions.some((item) => item.tool === "apply_chapter_patch" || item.tool === "queue_pipeline_run"),
    confidence: parsed.confidence,
  };
}

export function toPlannedActions(plan: AgentPlan): PlannedAction[] {
  const groups = new Map<PlannedAction["agent"], ToolCall[]>();
  for (const action of plan.actions) {
    const call: ToolCall = {
      tool: action.tool as ToolCall["tool"],
      reason: action.reason,
      idempotencyKey: slug(action.idempotencyKey),
      input: action.input,
    };
    const previous = groups.get(action.agent as PlannedAction["agent"]) ?? [];
    previous.push(call);
    groups.set(action.agent as PlannedAction["agent"], previous);
  }
  return Array.from(groups.entries()).map(([agent, calls]) => ({
    agent,
    reasoning: `${agent} 执行 ${calls.length} 个工具步骤。`,
    calls,
  }));
}
