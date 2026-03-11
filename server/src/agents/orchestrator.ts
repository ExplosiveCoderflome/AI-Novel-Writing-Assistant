import { z } from "zod";
import type { AgentPlan } from "@ai-novel/shared/types/agent";
import { getLLM } from "../llm/factory";
import { getPermissionMatrixSummary } from "./approvalPolicy";
import { listAgentToolDefinitions } from "./toolRegistry";
import type { PlannedAction, PlannerInput, PlannerResult, ToolCall } from "./types";

const planSchema = z.object({
  goal: z.string().min(1),
  contextNeeds: z.array(z.object({
    key: z.string().min(1),
    required: z.boolean(),
    reason: z.string().optional(),
  })).default([]),
  actions: z.array(z.object({
    agent: z.enum(["Planner", "Writer", "Reviewer", "Continuity", "Repair"]),
    tool: z.string().min(1),
    reason: z.string().min(1),
    idempotencyKey: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
  })).min(1),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  requiresApproval: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
});

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("No JSON object found.");
  }
  return cleaned.slice(first, last + 1);
}

function slug(value: string): string {
  const normalized = value.trim().replace(/[^\w-]/g, "_");
  return normalized.slice(0, 80) || `k_${Date.now()}`;
}

function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^\w-]/g, "");
}

function extractChapterId(goal: string): string | null {
  const patterns = [
    /chapter(?:\s*id)?[:：\s]+([a-zA-Z0-9_-]{6,})/i,
    /章节(?:ID|id)?[:：\s]+([a-zA-Z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match?.[1]) {
      return sanitizeId(match[1]);
    }
  }
  return null;
}

function extractRange(goal: string): { startOrder: number; endOrder: number } | null {
  const patterns = [
    /(\d+)\s*[-~到]\s*(\d+)/,
    /第\s*(\d+)\s*章.*第\s*(\d+)\s*章/,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (Number.isFinite(first) && Number.isFinite(second) && first > 0 && second > 0) {
      return {
        startOrder: Math.min(first, second),
        endOrder: Math.max(first, second),
      };
    }
  }
  return null;
}

function extractContent(goal: string): string | null {
  const match = goal.match(/(?:内容|正文|替换为)[:：]\s*([\s\S]+)$/);
  if (!match?.[1]) {
    return null;
  }
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

function isNovelTitleQuestion(goal: string): boolean {
  const trimmed = goal.trim();
  const lower = trimmed.toLowerCase();
  if (/^(书名|小说名|作品名|标题|title|name)\??$/i.test(trimmed)) {
    return true;
  }
  if (/(这本书|该书|本小说|这部小说|这个小说|小说|作品).{0,8}(叫什么|叫什么名字|名字|书名|标题)/.test(trimmed)) {
    return true;
  }
  if (/(what\s+is|what'?s).{0,20}(book\s+name|novel\s+name|title)/i.test(lower)) {
    return true;
  }
  return false;
}

function ensureNovelGroundingActions(plan: AgentPlan, input: PlannerInput): AgentPlan {
  if (input.contextMode !== "novel" || !input.novelId) {
    return plan;
  }
  if (!isNovelTitleQuestion(input.goal)) {
    return plan;
  }
  if (plan.actions.some((item) => item.tool === "get_novel_context")) {
    return plan;
  }
  const contextAction: AgentPlan["actions"][number] = {
    agent: "Planner",
    tool: "get_novel_context",
    reason: "用户在询问当前小说名称，必须先读取小说上下文。",
    idempotencyKey: `ctx_title_guard_${input.novelId}_${Date.now()}`,
    input: { novelId: input.novelId },
  };
  return {
    ...plan,
    contextNeeds: [
      { key: "novel_context", required: true, reason: "回答小说名称必须先读取小说上下文。" },
      ...plan.contextNeeds.filter((item) => item.key !== "novel_context"),
    ],
    actions: [contextAction, ...plan.actions],
    confidence: Math.max(plan.confidence, 0.75),
  };
}

function fallbackPlan(input: PlannerInput): AgentPlan {
  const goal = input.goal.trim();
  const lower = goal.toLowerCase();
  const now = Date.now();
  const chapterId = extractChapterId(goal);
  const actions: AgentPlan["actions"] = [];

  if (input.contextMode === "novel" && input.novelId) {
    actions.push({
      agent: "Planner",
      tool: "get_novel_context",
      reason: "读取小说上下文",
      idempotencyKey: `ctx_${input.novelId}_${now}`,
      input: { novelId: input.novelId },
    });
    actions.push({
      agent: "Planner",
      tool: "get_story_bible",
      reason: "读取小说圣经",
      idempotencyKey: `bible_${input.novelId}_${now}`,
      input: { novelId: input.novelId },
    });
  }

  if (goal.includes("角色") || lower.includes("character")) {
    if (input.novelId) {
      actions.push({
        agent: "Reviewer",
        tool: "get_character_states",
        reason: "查询角色状态",
        idempotencyKey: `chars_${input.novelId}_${now}`,
        input: { novelId: input.novelId },
      });
    }
  }

  if (goal.includes("时间线") || goal.includes("连贯")) {
    if (input.novelId) {
      actions.push({
        agent: "Continuity",
        tool: "get_timeline_facts",
        reason: "查询时间线事实",
        idempotencyKey: `facts_${input.novelId}_${now}`,
        input: { novelId: input.novelId, limit: 30 },
      });
    }
  }

  if (goal.includes("检索") || goal.includes("知识") || goal.includes("参考")) {
    actions.push({
      agent: "Planner",
      tool: "search_knowledge",
      reason: "执行知识检索",
      idempotencyKey: `search_${now}`,
      input: { query: goal, novelId: input.novelId },
    });
  }

  if ((goal.includes("保存章节草稿") || goal.includes("保存草稿")) && chapterId && input.novelId) {
    actions.push({
      agent: "Writer",
      tool: "save_chapter_draft",
      reason: "保存章节草稿",
      idempotencyKey: `draft_${chapterId}_${now}`,
      input: {
        novelId: input.novelId,
        chapterId,
        content: extractContent(goal) ?? goal,
      },
    });
  }

  if ((goal.includes("重写章节") || goal.includes("改写章节")) && chapterId && input.novelId) {
    actions.push({
      agent: "Repair",
      tool: "apply_chapter_patch",
      reason: "重写章节内容",
      idempotencyKey: `patch_${chapterId}_${now}`,
      input: {
        novelId: input.novelId,
        chapterId,
        mode: "full_replace",
        content: extractContent(goal) ?? goal,
        chapterIds: [chapterId],
      },
    });
  }

  if ((goal.includes("启动流水线") || goal.includes("批量生成")) && input.novelId) {
    const range = extractRange(goal) ?? { startOrder: 1, endOrder: 3 };
    actions.push({
      agent: "Planner",
      tool: "preview_pipeline_run",
      reason: "预览流水线执行范围",
      idempotencyKey: `preview_pipeline_${range.startOrder}_${range.endOrder}_${now}`,
      input: {
        novelId: input.novelId,
        startOrder: range.startOrder,
        endOrder: range.endOrder,
      },
    });
    actions.push({
      agent: "Planner",
      tool: "queue_pipeline_run",
      reason: "创建流水线任务",
      idempotencyKey: `queue_pipeline_${range.startOrder}_${range.endOrder}_${now}`,
      input: {
        novelId: input.novelId,
        startOrder: range.startOrder,
        endOrder: range.endOrder,
      },
    });
  }

  if (actions.length === 0) {
    actions.push({
      agent: "Planner",
      tool: "search_knowledge",
      reason: "默认知识检索兜底",
      idempotencyKey: `fallback_search_${now}`,
      input: { query: goal, novelId: input.novelId },
    });
  }

  return {
    goal,
    contextNeeds: [
      { key: input.contextMode === "novel" ? "novel_context" : "global_context", required: true },
    ],
    actions,
    riskLevel: actions.some((item) => item.tool === "apply_chapter_patch" || item.tool === "queue_pipeline_run")
      ? "high"
      : "medium",
    requiresApproval: actions.some((item) => item.tool === "apply_chapter_patch" || item.tool === "queue_pipeline_run"),
    confidence: 0.4,
  };
}

function toPlannedActions(plan: AgentPlan): PlannedAction[] {
  const groups = new Map<PlannedAction["agent"], ToolCall[]>();
  for (const action of plan.actions) {
    const call: ToolCall = {
      tool: action.tool as ToolCall["tool"],
      reason: action.reason,
      idempotencyKey: slug(action.idempotencyKey),
      input: action.input,
    };
    const prev = groups.get(action.agent) ?? [];
    prev.push(call);
    groups.set(action.agent, prev);
  }
  return Array.from(groups.entries()).map(([agent, calls]) => ({
    agent,
    reasoning: `${agent} 执行 ${calls.length} 个工具步骤。`,
    calls,
  }));
}

export async function createStructuredPlan(input: PlannerInput): Promise<PlannerResult> {
  const fallback = fallbackPlan(input);
  const tools = listAgentToolDefinitions().map((item) => `- ${item.name}: ${item.description}`).join("\n");
  const permissionSummary = getPermissionMatrixSummary();
  const recentMessages = input.messages.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n");

  try {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: typeof input.temperature === "number" ? Math.min(input.temperature, 0.2) : 0.1,
      maxTokens: input.maxTokens,
    });
    const response = await llm.invoke([
      {
        role: "system",
        content: [
          "你是小说创作 Agent 规划器，只能输出一个 JSON 对象。",
          "必须遵守权限矩阵，不能规划未授权工具。",
          "JSON schema keys: goal, contextNeeds, actions, riskLevel, requiresApproval, confidence。",
          "actions[].keys: agent, tool, reason, idempotencyKey, input。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `目标: ${input.goal}`,
          `上下文模式: ${input.contextMode}`,
          `novelId: ${input.novelId ?? "none"}`,
          `当前run状态: ${input.currentRunStatus ?? "queued"}`,
          `最近消息:\n${recentMessages || "none"}`,
          `可用工具:\n${tools}`,
          `权限矩阵:\n${permissionSummary}`,
          "请严格返回 JSON，不要解释文本。",
        ].join("\n\n"),
      },
    ]);
    const raw = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
          .map((item) => {
            if (typeof item === "string") {
              return item;
            }
            if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
              return item.text;
            }
            return "";
          })
          .join("")
        : "";
    const parsed = planSchema.parse(JSON.parse(extractJsonObject(raw)));
    const llmPlan: AgentPlan = {
      goal: parsed.goal,
      contextNeeds: parsed.contextNeeds,
      actions: parsed.actions,
      riskLevel: parsed.riskLevel,
      requiresApproval: parsed.requiresApproval,
      confidence: parsed.confidence,
    };
    const plan = ensureNovelGroundingActions(llmPlan, input);
    const actions = toPlannedActions(plan);
    if (actions.length === 0 || plan.confidence < 0.35) {
      const fallbackActions = toPlannedActions(fallback);
      return {
        plan: fallback,
        actions: fallbackActions,
        source: "fallback",
        validationWarnings: ["LLM plan low confidence, fallback applied."],
      };
    }
    return {
      plan,
      actions,
      source: "llm",
      validationWarnings: [],
    };
  } catch {
    const actions = toPlannedActions(fallback);
    return {
      plan: fallback,
      actions,
      source: "fallback",
      validationWarnings: ["LLM planner failed, fallback applied."],
    };
  }
}
