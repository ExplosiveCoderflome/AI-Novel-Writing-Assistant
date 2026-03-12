import { z } from "zod";
import { getLLM } from "../../llm/factory";
import { getPermissionMatrixSummary } from "../approvalPolicy";
import { listAgentToolDefinitions } from "../toolRegistry";
import type { PlannerInput, StructuredIntent } from "../types";
import { extractJsonObject } from "./utils";

export const intentSchema: z.ZodType<StructuredIntent> = z.object({
  goal: z.string().min(1),
  intent: z.enum([
    "query_novel_title",
    "query_chapter_content",
    "query_progress",
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

export async function parseIntentWithLLM(input: PlannerInput): Promise<StructuredIntent> {
  const llm = await getLLM(input.provider ?? "deepseek", {
    model: input.model,
    temperature: typeof input.temperature === "number" ? Math.min(input.temperature, 0.15) : 0.1,
    maxTokens: input.maxTokens,
  });
  const toolCatalog = listAgentToolDefinitions().map((item) => `- ${item.name}: ${item.description}`).join("\n");
  const permissionSummary = getPermissionMatrixSummary();
  const recentMessages = input.messages.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n");
  const response = await llm.invoke([
    {
      role: "system",
      content: [
        "你是小说创作 Agent 的意图解析器，只能返回一个 JSON 对象。",
        "你的任务不是直接规划所有工具，而是先识别用户真实意图和章节槽位。",
        "intent 必须是枚举值之一：query_novel_title, query_chapter_content, query_progress, write_chapter, rewrite_chapter, save_chapter_draft, start_pipeline, inspect_characters, inspect_timeline, inspect_world, search_knowledge, general_chat, unknown。",
        "chapterSelectors 可包含：chapterId, orders, range{startOrder,endOrder}, relative{type,count}。",
        "如果用户问“返回给我第1章的内容”，intent 应该是 query_chapter_content，orders=[1]。",
        "如果用户问“当前写完了几章”，intent 应该是 query_progress。",
        "如果用户说“书写第三章”，intent 应该是 write_chapter，orders=[3]。",
        "如果用户说“重写第三章”，intent 应该是 rewrite_chapter，orders=[3]。",
        "如果信息不足，不要猜测不存在的 chapterId，可以只返回 orders/range/relative。",
        "confidence 必须保守评估，0 到 1。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `当前目标: ${input.goal}`,
        `上下文模式: ${input.contextMode}`,
        `novelId: ${input.novelId ?? "none"}`,
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
  return intentSchema.parse(JSON.parse(extractJsonObject(raw)));
}
