import { z } from "zod";
import { getLLM } from "../../llm/factory";
import { getPermissionMatrixSummary } from "../approvalPolicy";
import { listAgentToolDefinitions } from "../toolRegistry";
import type { PlannerInput, StructuredIntent } from "../types";
import { extractJsonObject, normalizeIntentPayload } from "./utils";

export const intentSchema: z.ZodType<StructuredIntent> = z.object({
  goal: z.string().min(1),
  intent: z.enum([
    "list_novels",
    "list_worlds",
    "query_task_status",
    "create_novel",
    "select_novel_workspace",
    "bind_world_to_novel",
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
    "general_chat",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1).default(0.5),
  requiresNovelContext: z.boolean().default(false),
  novelTitle: z.string().trim().min(1).optional(),
  worldName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  targetChapterCount: z.number().int().min(1).max(200).optional(),
  genre: z.string().trim().min(1).optional(),
  worldType: z.string().trim().min(1).optional(),
  styleTone: z.string().trim().min(1).optional(),
  pacePreference: z.enum(["fast", "balanced", "slow"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
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
      return `意图字段不受支持：${rawIntent}`;
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
  return `LLM 返回的意图结构无效：${details.join("；")}。`;
}

export async function parseIntentWithLLM(input: PlannerInput): Promise<StructuredIntent> {
  const llm = await getLLM(input.provider ?? "deepseek", {
    model: input.model,
    temperature: typeof input.temperature === "number" ? Math.min(input.temperature, 0.15) : 0.1,
    maxTokens: input.maxTokens,
  });

  const toolCatalog = listAgentToolDefinitions()
    .map((item) => `- ${item.name}: ${item.description}`)
    .join("\n");
  const permissionSummary = getPermissionMatrixSummary();
  const recentMessages = input.messages.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n");

  const response = await llm.invoke([
    {
      role: "system",
      content: [
        "你是小说创作 Agent 的意图解析器，只能返回一个 JSON 对象。",
        "你的任务不是直接规划所有工具，而是先识别用户真实意图和章节槽位。",
        "intent 必须是以下枚举之一：list_novels, list_worlds, query_task_status, create_novel, select_novel_workspace, bind_world_to_novel, produce_novel, query_novel_production_status, query_novel_title, query_chapter_content, query_progress, inspect_failure_reason, write_chapter, rewrite_chapter, save_chapter_draft, start_pipeline, inspect_characters, inspect_timeline, inspect_world, search_knowledge, general_chat, unknown。",
        "如果用户明确提到小说标题，可以放入 novelTitle。",
        "如果用户明确提到世界观名称，可以放入 worldName。",
        "如果用户是在描述一本完整新书的生产任务，请使用 produce_novel，并尽量提取 description, targetChapterCount, genre, worldType, styleTone, pacePreference, narrativePov。",
        "pacePreference 只能是 fast、balanced、slow；narrativePov 只能是 first_person、third_person、mixed。",
        "chapterSelectors 可包含：chapterId, orders, range{startOrder,endOrder}, relative{type,count}。",
        "如果用户问“列出当前的小说列表”，intent 应该是 list_novels。",
        "如果用户问“查看当前有多少本在写的小说”或“当前有多少本小说”，intent 也应该是 list_novels。",
        "如果用户问“列出世界观列表”“当前有哪些世界观”或“查看世界观列表”，intent 应该是 list_worlds。",
        "如果用户问“列出当前系统任务状态”“系统现在有哪些任务”或“查看任务中心状态”，intent 应该是 query_task_status。",
        "如果用户说“创建一本小说《抗日奇侠传》”，intent 应该是 create_novel，novelTitle=抗日奇侠传。",
        "如果用户说“创建一本20章小说《抗日奇侠传》，并开始整本生成”，intent 应该是 produce_novel，novelTitle=抗日奇侠传，targetChapterCount=20。",
        "如果用户说“继续生成当前小说”，intent 应该是 produce_novel，requiresNovelContext=true。",
        "如果用户说“完成这本小说”“把这本小说写完”“继续把这本书写完”，intent 也应该是 produce_novel，requiresNovelContext=true。",
        "如果用户问“整本生成到哪一步了”“为什么整本生成没有启动”“当前资产准备完成了吗”，intent 应该是 query_novel_production_status。",
        "如果用户问“本书已经规划了几个角色”“当前小说有几个角色”或“列出当前小说角色情况”，intent 应该是 inspect_characters，requiresNovelContext=true。",
        "如果用户说“把《抗日奇侠传》设为当前工作区”，intent 应该是 select_novel_workspace，novelTitle=抗日奇侠传。",
        "如果用户说“将四合院设为当前小说的世界观”或“把四合院绑定为当前小说世界观”，intent 应该是 bind_world_to_novel，worldName=四合院，requiresNovelContext=true。",
        "如果用户问“返回给我第1章的内容”，intent 应该是 query_chapter_content，orders=[1]。",
        "如果用户问“当前写完了几章”，intent 应该是 query_progress。",
        "如果用户问“第三章为什么失败”或“生成第三章失败的原因是什么”，intent 应该是 inspect_failure_reason，orders=[3]。",
        "如果用户说“写第三章”，intent 应该是 write_chapter，orders=[3]。",
        "如果用户说“重写第三章”，intent 应该是 rewrite_chapter，orders=[3]。",
        "如果信息不足，不要猜测不存在的 chapterId，可以只返回 orders/range/relative。",
        "confidence 必须保守评估，范围 0 到 1。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `当前目标: ${input.goal}`,
        `上下文模式: ${input.contextMode}`,
        `novelId: ${input.novelId ?? "none"}`,
        `currentRunId: ${input.currentRunId ?? "none"}`,
        `当前 run 状态: ${input.currentRunStatus ?? "queued"}`,
        `当前 run 步骤: ${input.currentStep ?? "planning"}`,
        `最近消息:\n${recentMessages || "none"}`,
        `可用工具:\n${toolCatalog}`,
        `权限矩阵:\n${permissionSummary}`,
        "只返回 JSON，不要返回解释。",
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("LLM 未返回合法的 JSON 意图结果。");
  }

  const normalizedPayload = normalizeIntentPayload(parsedJson, input);
  const result = intentSchema.safeParse(normalizedPayload);
  if (!result.success) {
    throw new Error(summarizeIntentValidationFailure(normalizedPayload, result.error.issues));
  }
  return result.data;
}
