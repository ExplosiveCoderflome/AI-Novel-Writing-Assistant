import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { supportsForcedJsonOutput } from "../../llm/capabilities";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { genreTreeNodeSchema } from "./genreSchemas";

export interface GenreTreeDraft {
  name: string;
  description?: string;
  children: GenreTreeDraft[];
}

export interface GenerateGenreTreeInput {
  prompt: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return JSON.stringify(content ?? "");
  }
  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }
    if (typeof part === "object" && part !== null && "text" in part) {
      return toTrimmedString((part as { text?: unknown }).text);
    }
    return JSON.stringify(part);
  }).join("");
}

function extractJsonObject(source: string): string {
  const normalized = source.replace(/```json|```/gi, "").trim();
  const first = normalized.indexOf("{");
  const last = normalized.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("模型输出异常：无法解析为合法 JSON。");
  }
  return normalized.slice(first, last + 1);
}

function sanitizeGeneratedNode(value: unknown, depth = 1): GenreTreeDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("模型输出异常：类型树节点不是合法对象。");
  }

  const record = value as {
    name?: unknown;
    description?: unknown;
    children?: unknown;
  };

  const name = toTrimmedString(record.name);
  if (!name) {
    throw new Error("模型输出异常：类型名称为空。");
  }

  const description = toTrimmedString(record.description);
  const rawChildren = Array.isArray(record.children) ? record.children : [];
  if (depth >= 3) {
    return {
      name,
      description: description || undefined,
      children: [],
    };
  }

  const childLimit = depth === 1 ? 6 : 4;
  const seen = new Set<string>();
  const children: GenreTreeDraft[] = [];

  for (const child of rawChildren.slice(0, childLimit)) {
    try {
      const normalizedChild = sanitizeGeneratedNode(child, depth + 1);
      const dedupeKey = normalizedChild.name.toLocaleLowerCase("zh-CN");
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      children.push(normalizedChild);
    } catch {
      continue;
    }
  }

  return {
    name,
    description: description || undefined,
    children,
  };
}

function buildMessages(prompt: string, retry = false, forceJson = false): BaseMessage[] {
  const retryInstruction = retry
    ? "\n你上一次没有输出合法 JSON。这一次只能返回一个 JSON 对象，禁止附带解释、Markdown、注释或额外文本。"
    : "";
  const providerJsonInstruction = forceJson
    ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
    : "";

  return [
    new SystemMessage(`你是一个专业的网络小说类型策划专家。
你的任务是根据用户描述，生成一棵“主类型 -> 子类型 -> 下级类型”的小说类型树。

输出要求：
1. 只返回一个 JSON 对象，不要输出 Markdown、解释、注释或额外文本。
2. JSON 结构固定如下：
{
  "name": "主类型名称",
  "description": "主类型说明",
  "children": [
    {
      "name": "子类型名称",
      "description": "子类型说明",
      "children": [
        {
          "name": "下级类型名称",
          "description": "下级类型说明",
          "children": []
        }
      ]
    }
  ]
}
3. 最多三层：主类型、子类型、下级类型。
4. 名称要简洁、清晰、可直接用于产品里的类型标签。
5. 描述要说明题材特征、常见爽点、叙事重心或读者期待。
6. 子类型不要堆太多，重点做出有区分度的结构。
7. 结果必须符合主流价值观，避免违规或低俗内容。${retryInstruction}${providerJsonInstruction}`),
    new HumanMessage(`请根据下面的创作方向生成类型树：

${prompt.trim()}`),
  ];
}

export async function generateGenreTreeDraft(input: GenerateGenreTreeInput): Promise<GenreTreeDraft> {
  const provider = input.provider ?? "deepseek";
  const forceJson = supportsForcedJsonOutput(provider, input.model);

  let lastError: unknown;

  for (const retry of [false, true]) {
    try {
      const messages = buildMessages(input.prompt, retry, forceJson);
      const systemPrompt = toMessagePrompt(messages[0]);
      const userPrompt = toMessagePrompt(messages[1]);

      const parsed = await invokeStructuredLlm({
        label: `genre-tree:${retry ? "retry" : "init"}`,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.6,
        maxTokens: input.maxTokens,
        taskType: "planner",
        systemPrompt,
        userPrompt,
        schema: genreTreeNodeSchema,
        maxRepairAttempts: 1,
      });

      return sanitizeGeneratedNode(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`类型树生成失败：${lastError.message}`);
  }
  throw new Error("类型树生成失败。");
}

function toMessagePrompt(message: BaseMessage): string {
  const content = (message as unknown as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : typeof item === "object" && item && "text" in item ? (item as { text?: unknown }).text : ""))
      .join("");
  }
  return JSON.stringify(content ?? "");
}
