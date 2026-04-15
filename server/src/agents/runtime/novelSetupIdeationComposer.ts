import { getLLM } from "../../llm/factory";
import { preparePromptExecution, runTextPrompt } from "../../prompting/core/promptRunner";
import { runtimeSetupIdeationPrompt } from "../../prompting/prompts/agent/runtime.prompts";
import type { StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import { safeJson, type ToolExecutionResult } from "./runtimeHelpers";

type IdeationLLMFactory = typeof getLLM;

let ideationLLMFactory: IdeationLLMFactory = getLLM;

function resolveIdeationMaxTokens(maxTokens: number | undefined): number | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return undefined;
  }
  return Math.min(Math.floor(maxTokens), 8000);
}

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
    const resolvedMaxTokens = resolveIdeationMaxTokens(context.maxTokens);
    if (ideationLLMFactory === getLLM) {
      const result = await runTextPrompt({
        asset: runtimeSetupIdeationPrompt,
        promptInput: {
          goal,
          structuredIntentJson: safeJson(structuredIntent ?? { intent: "ideate_novel_setup" }),
          facts,
        },
        options: {
          provider: context.provider ?? "deepseek",
          model: context.model,
          temperature: Math.max(context.temperature ?? 0.75, 0.75),
          maxTokens: resolvedMaxTokens,
        },
      });
      return result.output.trim() || fallback;
    }

    const prepared = preparePromptExecution({
      asset: runtimeSetupIdeationPrompt,
      promptInput: {
        goal,
        structuredIntentJson: safeJson(structuredIntent ?? { intent: "ideate_novel_setup" }),
        facts,
      },
    });
    const llm = await ideationLLMFactory(context.provider ?? "deepseek", {
      model: context.model,
      temperature: Math.max(context.temperature ?? 0.75, 0.75),
      maxTokens: resolvedMaxTokens,
      taskType: runtimeSetupIdeationPrompt.taskType,
      promptMeta: prepared.invocation,
    });
    const result = await llm.invoke(prepared.messages);
    const text = extractTextFromContent(result.content);
    return text || fallback;
  } catch {
    return fallback;
  }
}

export function setNovelSetupIdeationLLMFactoryForTests(factory?: IdeationLLMFactory): void {
  ideationLLMFactory = factory ?? getLLM;
}
