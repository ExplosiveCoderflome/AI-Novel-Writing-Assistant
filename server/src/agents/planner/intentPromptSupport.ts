import { z } from "zod";
import { getPermissionMatrixSummary } from "../approvalPolicy";
import { listAgentToolDefinitions, listPlannerSemanticDefinitions } from "../toolRegistry";
import type { PlannerInput, StructuredIntent } from "../types";

export const INTENT_NAMES = [
  "social_opening",
  "list_novels",
  "list_base_characters",
  "list_worlds",
  "query_task_status",
  "create_novel",
  "select_novel_workspace",
  "bind_world_to_novel",
  "unbind_world_from_novel",
  "produce_novel",
  "query_novel_production_status",
  "query_novel_title",
  "query_chapter_content",
  "query_progress",
  "inspect_failure_reason",
  "write_chapter",
  "rewrite_chapter",
  "save_chapter_draft",
  "start_pipeline",
  "inspect_characters",
  "inspect_timeline",
  "inspect_world",
  "search_knowledge",
  "ideate_novel_setup",
  "general_chat",
  "unknown",
] as const satisfies readonly StructuredIntent["intent"][];

const WORKFLOW_RECIPES = [
  {
    intent: "produce_novel",
    when: "用户要求创建并启动整本生成，或继续/完成当前小说的整本生产。",
    examples: [
      "创建一本20章小说《抗日奇侠传》，并开始整本生成",
      "继续生成当前小说",
      "完成这本小说",
      "把这本书写完",
    ],
  },
  {
    intent: "query_novel_production_status",
    when: "用户在问整本生成卡在哪一步、是否启动、资产是否准备完成。",
    examples: [
      "整本生成到哪一步了",
      "为什么整本生成没有启动",
      "当前资产准备完成了吗",
    ],
  },
  {
    intent: "query_chapter_content",
    when: "用户要查看某章或某段章节范围的正文/摘要。",
    examples: [
      "返回给我第1章的内容",
      "前两章都写了什么",
    ],
  },
  {
    intent: "inspect_failure_reason",
    when: "用户在问生成失败、章节失败或阻塞原因。",
    examples: [
      "第三章为什么失败",
      "生成第三章失败的原因是什么",
    ],
  },
  {
    intent: "write_chapter",
    when: "用户要求推进某章写作。",
    examples: [
      "写第三章",
      "继续写第5章",
    ],
  },
  {
    intent: "rewrite_chapter",
    when: "用户明确要求重写、改写某章。",
    examples: [
      "重写第三章",
      "把第6章改写一版",
    ],
  },
  {
    intent: "query_progress",
    when: "用户在问当前已经写完几章、进度到哪。",
    examples: [
      "当前写完了几章",
      "现在进度到哪了",
    ],
  },
];

export const intentSchema: z.ZodType<StructuredIntent> = z.object({
  goal: z.string().min(1),
  intent: z.enum(INTENT_NAMES),
  confidence: z.number().min(0).max(1).default(0.5),
  requiresNovelContext: z.boolean().default(false),
  interactionMode: z.enum(["co_create", "review", "query", "plan", "execute"]).default("execute"),
  assistantResponse: z.enum(["ask_followup", "offer_options", "explain", "execute"]).default("explain"),
  shouldAskFollowup: z.boolean().default(false),
  missingInfo: z.array(z.string().trim().min(1)).max(4).default([]),
  novelTitle: z.string().trim().min(1).optional(),
  worldName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  targetChapterCount: z.number().int().min(1).max(200).optional(),
  genre: z.string().trim().min(1).optional(),
  worldType: z.string().trim().min(1).optional(),
  styleTone: z.string().trim().min(1).optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).optional(),
  pacePreference: z.enum(["fast", "balanced", "slow"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).optional(),
  chapterSelectors: z.object({
    chapterId: z.string().trim().min(1).optional(),
    orders: z.array(z.number().int().min(1)).max(8).optional(),
    range: z.object({
      startOrder: z.number().int().min(1),
      endOrder: z.number().int().min(1),
    }).optional(),
    relative: z.object({
      type: z.enum(["first_n"]),
      count: z.number().int().min(1).max(20),
    }).optional(),
  }).default({}),
  content: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

function buildSemanticCatalog(): string {
  const items = listPlannerSemanticDefinitions();
  if (items.length === 0) {
    return "none";
  }
  return items.map((item) => [
    `- intent=${item.intent}; tool=${item.toolName}; requiresNovelContext=${item.requiresNovelContext}`,
    `  title=${item.title}`,
    `  description=${item.description}`,
    `  aliases=${item.aliases.join(", ") || "none"}`,
    `  phrases=${item.phrases.join(" | ") || "none"}`,
    `  when=${item.whenToUse ?? "none"}`,
    `  avoid=${item.whenNotToUse ?? "none"}`,
    `  inputs=${item.inputSchemaSummary.join(", ") || "none"}`,
  ].join("\n")).join("\n");
}

function buildWorkflowRecipeCatalog(): string {
  return WORKFLOW_RECIPES.map((item) => [
    `- intent=${item.intent}`,
    `  when=${item.when}`,
    `  examples=${item.examples.join(" | ")}`,
  ].join("\n")).join("\n");
}

function buildToolCatalog(): string {
  return listAgentToolDefinitions()
    .map((item) => `- ${item.name}: ${item.description}`)
    .join("\n");
}

export function summarizeIntentValidationFailure(
  payload: Record<string, unknown>,
  issues: z.ZodIssue[],
): string {
  const details = issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    if (path === "intent") {
      const rawIntent = typeof payload.intent === "string" && payload.intent.trim()
        ? payload.intent.trim()
        : "unknown";
      return `intent 不受支持: ${rawIntent}`;
    }
    if (issue.code === "invalid_type") {
      return `字段 ${path} 类型不正确`;
    }
    if (issue.code === "invalid_value") {
      return `字段 ${path} 的值不在允许范围内`;
    }
    if (issue.code === "too_small") {
      return `字段 ${path} 缺少有效内容`;
    }
    if (issue.code === "too_big") {
      return `字段 ${path} 超出允许范围`;
    }
    return `字段 ${path} 不符合要求`;
  });
  return `LLM 返回的意图 JSON 无效: ${details.join("；")}`;
}

export function buildPlannerIntentPromptParts(input: PlannerInput): { systemPrompt: string; userPrompt: string } {
  const permissionSummary = getPermissionMatrixSummary();
  const recentMessages = input.messages.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n");
  const semanticCatalog = buildSemanticCatalog();
  const workflowRecipes = buildWorkflowRecipeCatalog();
  const toolCatalog = buildToolCatalog();

  return {
    systemPrompt: [
      "创作中枢默认是协作式创作搭档，不是命令路由器。",
      "你必须在 JSON 中显式返回 interactionMode、assistantResponse、shouldAskFollowup、missingInfo。",
      "如果用户还在探索方向、比较方案、表达不满、寻求诊断，或者创作目标本身还不够清晰，优先把 interactionMode 设为 co_create 或 review，并把 shouldAskFollowup 设为 true。",
      "只有当用户明确要求立即创建、绑定、保存、启动任务或直接写内容时，才把 interactionMode 设为 execute。",
      "当下一步更适合追问澄清时，assistantResponse 用 ask_followup；当下一步更适合给方案备选时，assistantResponse 用 offer_options。",
      "如果用户只是寒暄、打招呼、简单问候，且还没有进入具体创作任务，intent 应优先使用 social_opening，而不是 general_chat。",
      "你是小说创作 Agent 的意图解析器，只能返回一个 JSON 对象。",
      "你的任务不是直接规划所有工具，而是先识别用户真实意图和章节槽位。",
      `intent 必须是以下枚举之一：${INTENT_NAMES.join(", ")}。`,
      "优先使用原子意图语义目录识别列表、查询、检索、绑定这类单一意图。",
      "只有在用户请求明显属于整本生产、章节写作、失败诊断等复合流程时，才使用 workflow intent。",
      "如果用户表达命中目录中的 aliases 或 phrases，请返回对应的 canonical intent，不要返回别名或 tool 名。",
      "如果用户明确提到小说标题，可以放入 novelTitle。",
      "如果用户明确提到世界观名称，可以放入 worldName。",
      "如果用户是在描述一本完整新书的生产任务，请使用 produce_novel，并尽量提取 description、targetChapterCount、genre、worldType、styleTone、projectMode、pacePreference、narrativePov、emotionIntensity、aiFreedom、defaultChapterLength。",
      "如果用户在问某个关键词、关系模式、题材、设定或世界观原型是否存在于知识库、已索引的拆书资料或世界观中，或者想找类似于 X 的设定或参考案例，优先使用 search_knowledge，不要误判成 general_chat。",
      "如果用户是在取消或解绑当前小说的世界观，例如不要这个世界观了、取消世界观绑定、先不用某某世界观，优先使用 unbind_world_from_novel，不要误判成 bind_world_to_novel。",
      "如果用户想基于当前标题、已有设定或当前工作区信息生成几套备选方案，例如给我备选、给几个方向、提供 3 套核心设定或故事承诺或题材风格方案，优先使用 ideate_novel_setup，不要误判成 general_chat。",
      "projectMode 只能是 ai_led、co_pilot、draft_mode、auto_pipeline；pacePreference 只能是 fast、balanced、slow；narrativePov 只能是 first_person、third_person、mixed。",
      "emotionIntensity 和 aiFreedom 只能是 low、medium、high；defaultChapterLength 是 500 到 10000 的整数。",
      "chapterSelectors 可包含：chapterId、orders、range{startOrder,endOrder}、relative{type,count}。",
      "如果信息不足，不要猜测不存在的 chapterId，可以只返回 orders、range 或 relative。",
      "如果用户问的是基础角色模板库，应该偏向 list_base_characters；如果用户问的是当前小说中的角色状态，应该偏向 inspect_characters，并要求小说上下文。",
      "confidence 必须保守评估，范围 0 到 1。",
      "只返回 JSON，不要解释。",
    ].join("\n"),
    userPrompt: [
      `当前目标: ${input.goal}`,
      `上下文模式: ${input.contextMode}`,
      `novelId: ${input.novelId ?? "none"}`,
      `currentRunId: ${input.currentRunId ?? "none"}`,
      `当前 run 状态: ${input.currentRunStatus ?? "queued"}`,
      `当前 run 步骤: ${input.currentStep ?? "planning"}`,
      `最近消息:\n${recentMessages || "none"}`,
      `原子意图语义目录:\n${semanticCatalog}`,
      `复合 workflow recipes:\n${workflowRecipes}`,
      `可用工具总览:\n${toolCatalog}`,
      `权限摘要:\n${permissionSummary}`,
      "请输出一个合法 JSON 对象。",
    ].join("\n\n"),
  };
}
