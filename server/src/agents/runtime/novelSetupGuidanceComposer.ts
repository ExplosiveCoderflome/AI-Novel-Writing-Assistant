import { getLLM } from "../../llm/factory";
import type { StructuredIntent, ToolCall, ToolExecutionContext } from "../types";
import type { ToolExecutionResult } from "./runtimeHelpers";
import {
  buildNovelSetupGuidanceFacts,
  formatNovelSetupGuidance,
  parseNovelSetupStatus,
} from "./novelSetupResponses";

type GuidanceScene =
  | "create_missing_title"
  | "produce_missing_title"
  | "create_setup"
  | "select_setup";

type GuidanceLLMFactory = typeof getLLM;

let guidanceLLMFactory: GuidanceLLMFactory = getLLM;

function truncateFact(value: string, max = 160): string {
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

function buildIntentFacts(structuredIntent?: StructuredIntent): string {
  if (!structuredIntent) {
    return "当前没有额外的结构化创作线索。";
  }
  const lines = [
    structuredIntent.novelTitle ? `用户已提到标题：${truncateFact(structuredIntent.novelTitle)}` : "用户还没有明确标题。",
    structuredIntent.genre ? `用户提到的题材：${truncateFact(structuredIntent.genre)}` : null,
    structuredIntent.description ? `用户提到的设定：${truncateFact(structuredIntent.description)}` : null,
    structuredIntent.styleTone ? `用户提到的风格：${truncateFact(structuredIntent.styleTone)}` : null,
  ].filter((item): item is string => Boolean(item));

  return lines.length > 0 ? lines.join("\n") : "当前没有额外的结构化创作线索。";
}

function fallbackForMissingTitle(scene: GuidanceScene): string {
  if (scene === "produce_missing_title") {
    return "可以，我们先把这本书的起点定下来。你想先给它一个暂定标题，还是先说说题材、主角和核心冲突？";
  }
  return "可以，我们先把这本书的雏形定下来。你想先给它一个暂定标题，还是先告诉我你想写什么类型、谁是主角？";
}

async function composeWarmGuidance(input: {
  goal: string;
  scene: GuidanceScene;
  context: Omit<ToolExecutionContext, "runId" | "agentName">;
  facts: string;
  fallback: string;
  structuredIntent?: StructuredIntent;
}): Promise<string> {
  try {
    const llm = await guidanceLLMFactory(input.context.provider ?? "deepseek", {
      model: input.context.model,
      temperature: Math.max(input.context.temperature ?? 0.7, 0.7),
      maxTokens: Math.min(input.context.maxTokens ?? 384, 384),
    });
    const sceneInstruction = input.scene === "create_missing_title"
      ? "用户刚表达想写一本小说，但还没有形成可创建的标题。"
      : input.scene === "produce_missing_title"
        ? "用户想直接开始整本生产，但当前没有可用的小说标题或小说上下文。"
        : input.scene === "create_setup"
          ? "小说已经创建成功，现在要继续做开书初始化引导。"
          : "用户刚切换回一部小说的工作区，需要继续未完成的初始化。";
    const result = await llm.invoke([
      {
        role: "system",
        content: [
          "你是小说创作中枢里的开书引导助手。",
          "你的任务是根据已知事实，用更自然、亲切、简洁的中文把用户带到下一步，不要像表单提示或系统通知。",
          "必须严格基于给定事实，不得虚构小说设定、进度、角色或用户偏好。",
          "如果标题还没确定，不要假装小说已经创建；可以自然地邀请用户先给暂定标题，或者先讲题材、主角、冲突。",
          "如果已有初始化状态，先轻轻承接当前进展，再围绕最优先的一项自然追问，不要原样复读“系统建议提问”或“系统建议动作”。",
          "输出 2 到 4 句，不要用列表，不要使用“缺失项”“recommendedAction”“nextQuestion”这类内部术语。",
          "最后一句尽量是便于用户直接回答的问题；如果用户暂时没想好，可以顺带给出“我也可以先给你几个方向”的柔和选项。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `场景：${sceneInstruction}`,
          `用户原始目标：${input.goal}`,
          `结构化线索：${buildIntentFacts(input.structuredIntent)}`,
          `已知事实：\n${input.facts}`,
          "请生成现在要发给用户的下一条回复。",
        ].join("\n\n"),
      },
    ]);
    const text = extractTextFromContent(result.content);
    return text || input.fallback;
  } catch {
    return input.fallback;
  }
}

export async function composeCreateNovelSetupAnswer(
  goal: string,
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  const created = getSuccessfulOutput(results, "create_novel");
  if (!created) {
    return composeWarmGuidance({
      goal,
      scene: "create_missing_title",
      context,
      structuredIntent,
      facts: "当前还没有创建成功的小说，也没有稳定的小说标题。",
      fallback: fallbackForMissingTitle("create_missing_title"),
    });
  }

  const title = typeof created.title === "string" ? created.title.trim() : "";
  const setup = parseNovelSetupStatus(created.setup);
  if (title && setup) {
    return composeWarmGuidance({
      goal,
      scene: "create_setup",
      context,
      structuredIntent,
      facts: buildNovelSetupGuidanceFacts(setup),
      fallback: formatNovelSetupGuidance(`已创建小说《${title}》，我们先把最关键的设定补齐。`, setup),
    });
  }

  return title ? `已创建小说《${title}》。` : "已创建小说。";
}

export async function composeSelectNovelWorkspaceSetupAnswer(
  goal: string,
  results: ToolExecutionResult[],
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent?: StructuredIntent,
): Promise<string> {
  const selected = getSuccessfulOutput(results, "select_novel_workspace");
  if (!selected) {
    return "告诉我你想切到哪本小说，我就继续接着它的设定往下推进。";
  }

  const title = typeof selected.title === "string" ? selected.title.trim() : "";
  const setup = parseNovelSetupStatus(selected.setup);
  if (title && setup && setup.stage !== "ready_for_production") {
    return composeWarmGuidance({
      goal,
      scene: "select_setup",
      context,
      structuredIntent,
      facts: buildNovelSetupGuidanceFacts(setup),
      fallback: formatNovelSetupGuidance(`已切换到小说《${title}》的工作区，我们继续把设定补完整。`, setup),
    });
  }

  return title ? `已将当前工作区切换到《${title}》。` : "已切换当前工作区。";
}

export async function composeMissingNovelKickoffAnswer(
  goal: string,
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  structuredIntent: StructuredIntent | undefined,
  scene: "create_missing_title" | "produce_missing_title",
): Promise<string> {
  return composeWarmGuidance({
    goal,
    scene,
    context,
    structuredIntent,
    facts: [
      "当前没有可用的小说上下文。",
      structuredIntent?.novelTitle ? `当前已有标题线索：${truncateFact(structuredIntent.novelTitle)}` : "当前还没有可靠标题。",
    ].join("\n"),
    fallback: fallbackForMissingTitle(scene),
  });
}

export function setNovelSetupGuidanceLLMFactoryForTests(factory?: GuidanceLLMFactory): void {
  guidanceLLMFactory = factory ?? getLLM;
}
