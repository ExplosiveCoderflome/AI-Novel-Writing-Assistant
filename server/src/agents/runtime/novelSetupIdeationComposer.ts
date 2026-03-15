import { getLLM } from "../../llm/factory";
import type { StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import { safeJson, type ToolExecutionResult } from "./runtimeHelpers";

type IdeationLLMFactory = typeof getLLM;

let ideationLLMFactory: IdeationLLMFactory = getLLM;

function truncateFact(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
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
      .trim();
  }
  return "";
}

function getSuccessfulOutput(results: ToolExecutionResult[], tool: ToolCall["tool"]): Record<string, unknown> | null {
  return results.find((item) => item.success && item.tool === tool && item.output)?.output ?? null;
}

function toReadableValue(value: unknown): string | null {
  if (typeof value === "string") {
    return truncateFact(value);
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function pushFact(lines: string[], label: string, value: unknown): void {
  const text = toReadableValue(value);
  if (text) {
    lines.push(`${label}：${text}`);
  }
}

function buildIdeationFacts(results: ToolExecutionResult[], structuredIntent?: StructuredIntent): string {
  const novelContext = getSuccessfulOutput(results, "get_novel_context");
  const storyBible = getSuccessfulOutput(results, "get_story_bible");
  const world = getSuccessfulOutput(results, "get_world_constraints");
  const knowledge = getSuccessfulOutput(results, "search_knowledge");
  const lines: string[] = [];

  if (novelContext) {
    pushFact(lines, "小说标题", novelContext.title);
    pushFact(lines, "已有简介", novelContext.description);
    pushFact(lines, "题材", novelContext.genre);
    pushFact(lines, "风格气质", novelContext.styleTone);
    pushFact(lines, "叙事视角", novelContext.narrativePov);
    pushFact(lines, "推进节奏", novelContext.pacePreference);
    pushFact(lines, "协作模式", novelContext.projectMode);
    pushFact(lines, "情绪强度", novelContext.emotionIntensity);
    pushFact(lines, "AI 自由度", novelContext.aiFreedom);
    pushFact(lines, "默认章长", novelContext.defaultChapterLength);
    pushFact(lines, "绑定世界观", novelContext.worldName);
    pushFact(lines, "已有大纲", novelContext.outline);
    pushFact(lines, "结构化大纲", novelContext.structuredOutline);
    pushFact(lines, "章节数", novelContext.chapterCount);
    pushFact(lines, "已完成章节数", novelContext.completedChapterCount);
  }

  if (storyBible) {
    pushFact(lines, "核心设定草稿", storyBible.coreSetting);
    pushFact(lines, "故事承诺", storyBible.mainPromise);
    pushFact(lines, "角色弧线", storyBible.characterArcs);
    pushFact(lines, "世界规则", storyBible.worldRules);
    pushFact(lines, "禁用规则", storyBible.forbiddenRules);
  }

  if (world) {
    pushFact(lines, "世界观名称", world.worldName);
    const constraints = typeof world.constraints === "object" && world.constraints
      ? world.constraints as Record<string, unknown>
      : null;
    if (constraints) {
      pushFact(lines, "世界公理", constraints.axioms);
      pushFact(lines, "力量体系", constraints.magicSystem);
      pushFact(lines, "核心冲突环境", constraints.conflicts);
      pushFact(lines, "一致性备注", constraints.consistencyReport);
    }
  }

  if (knowledge) {
    pushFact(lines, "知识库命中数", knowledge.hitCount);
    pushFact(lines, "知识库上下文", knowledge.contextBlock);
  }

  if (structuredIntent) {
    pushFact(lines, "用户显式标题", structuredIntent.novelTitle);
    pushFact(lines, "用户显式题材", structuredIntent.genre);
    pushFact(lines, "用户显式设定", structuredIntent.description);
    pushFact(lines, "用户显式风格", structuredIntent.styleTone);
  }

  return lines.length > 0 ? lines.join("\n") : "当前还没有可用的小说上下文事实。";
}

function buildIdeationFallback(results: ToolExecutionResult[], structuredIntent?: StructuredIntent): string {
  const novelContext = getSuccessfulOutput(results, "get_novel_context");
  const title = typeof novelContext?.title === "string" && novelContext.title.trim()
    ? novelContext.title.trim()
    : typeof structuredIntent?.novelTitle === "string" && structuredIntent.novelTitle.trim()
      ? structuredIntent.novelTitle.trim()
      : "";

  if (title) {
    return `我可以直接围绕《${title}》给你做几套备选，不过为了更贴近你要的方向，最好再告诉我你最想保留的一个核心元素，比如题材、主角身份，或者最想写的冲突。`;
  }
  return "我可以直接给你做几套备选，不过先告诉我这本书至少要保留什么：暂定标题、题材，或者一个你最想写的冲突点。";
}

export async function composeNovelSetupIdeationAnswer(
  goal: string,
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  const facts = buildIdeationFacts(results, structuredIntent);
  const fallback = buildIdeationFallback(results, structuredIntent);

  try {
    const llm = await ideationLLMFactory(context.provider ?? "deepseek", {
      model: context.model,
      temperature: Math.max(context.temperature ?? 0.75, 0.75),
      maxTokens: Math.min(context.maxTokens ?? 900, 900),
    });
    const result = await llm.invoke([
      {
        role: "system",
        content: [
          "你是小说开书阶段的设定脑暴助手。",
          "用户现在要基于当前小说工作区的已知信息，生成若干套可选方案。",
          "必须优先使用给定事实；如果事实还不完整，也要围绕标题和已有线索给出暂定方案，不要回答“当前信息不足，无法继续”。",
          "不要虚构成已经确定的事实。凡是你补足的方向，都要以“可以走这个方向 / 可选方案 / 暂定版本”的口吻表达。",
          "如果已有世界规则、故事承诺、风格偏好或禁用规则，生成的方案必须与这些约束保持一致。",
          "严格满足用户请求的数量和格式。如果用户要 3 套，就给 3 套。",
          "每套方案之间要拉开差异，不要只是改几个词。",
          "输出简洁中文，默认使用编号列表。最后补一句简短引导，方便用户直接选一版、混搭，或继续细化。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `用户当前请求：${goal}`,
          `结构化意图：${safeJson(structuredIntent ?? { intent: "ideate_novel_setup" })}`,
          `当前可用事实：\n${facts}`,
          "请直接生成现在要发给用户的回答。",
        ].join("\n\n"),
      },
    ]);
    const text = extractTextFromContent(result.content);
    return text || fallback;
  } catch {
    return fallback;
  }
}

export function setNovelSetupIdeationLLMFactoryForTests(factory?: IdeationLLMFactory): void {
  ideationLLMFactory = factory ?? getLLM;
}
