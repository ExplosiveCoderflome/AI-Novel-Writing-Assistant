import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";

interface DraftOptimizeInput {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  currentDraft: string;
  instruction: string;
  mode: "full" | "selection";
  selectedText?: string;
  target: "outline" | "structured_outline";
}

function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("未检测到有效 JSON 数组。");
  }
  return text.slice(first, last + 1);
}

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function buildSelectionContext(currentDraft: string, selectedText: string): {
  before: string;
  after: string;
  index: number;
} {
  const draft = normalizeLineBreaks(currentDraft);
  const selection = normalizeLineBreaks(selectedText);
  const index = draft.indexOf(selection);
  if (index < 0) {
    throw new Error("选中的文本未在当前草稿中找到，请重新选择后再试。");
  }
  const windowSize = 180;
  const before = draft.slice(Math.max(0, index - windowSize), index).trim();
  const after = draft.slice(index + selection.length, index + selection.length + windowSize).trim();
  return { before, after, index };
}

function buildWorldContext(novel: {
  world?: {
    name: string;
    worldType?: string | null;
    description?: string | null;
    axioms?: string | null;
    background?: string | null;
    geography?: string | null;
    magicSystem?: string | null;
    politics?: string | null;
    races?: string | null;
    religions?: string | null;
    technology?: string | null;
    conflicts?: string | null;
    history?: string | null;
    economy?: string | null;
    factions?: string | null;
  } | null;
}): string {
  const world = novel.world;
  if (!world) {
    return "世界上下文：暂无";
  }
  let axiomsText = "无";
  if (world.axioms) {
    try {
      const parsed = JSON.parse(world.axioms) as string[];
      axiomsText = Array.isArray(parsed) && parsed.length > 0
        ? parsed.map((item) => `- ${item}`).join("\n")
        : world.axioms;
    } catch {
      axiomsText = world.axioms;
    }
  }
  return `世界上下文：
世界名称：${world.name}
世界类型：${world.worldType ?? "未指定"}
世界简介：${world.description ?? "无"}
核心公理：
${axiomsText}
背景：${world.background ?? "无"}
地理：${world.geography ?? "无"}
力量体系：${world.magicSystem ?? "无"}
社会政治：${world.politics ?? "无"}
种族：${world.races ?? "无"}
宗教：${world.religions ?? "无"}
科技：${world.technology ?? "无"}
历史：${world.history ?? "无"}
经济：${world.economy ?? "无"}
势力关系：${world.factions ?? "无"}
核心冲突：${world.conflicts ?? "无"}`;
}

export class NovelDraftOptimizeService {
  async optimizePreview(novelId: string, input: DraftOptimizeInput): Promise<{
    optimizedDraft: string;
    mode: "full" | "selection";
    selectedText?: string | null;
  }> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { world: true, characters: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    const currentDraft = input.currentDraft.trim();
    if (!currentDraft) {
      throw new Error("当前草稿不能为空。");
    }

    const worldContext = buildWorldContext(novel);
    const charactersText = novel.characters.length > 0
      ? novel.characters
          .map((c) => `- ${c.name}(${c.role})${c.personality ? `：${c.personality.slice(0, 80)}` : ""}`)
          .join("\n")
      : "暂无";

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.4,
    });

    if (input.mode === "selection") {
      const selectedText = input.selectedText?.trim();
      if (!selectedText) {
        throw new Error("选区优化模式下必须提供 selectedText。");
      }
      const selectionContext = buildSelectionContext(currentDraft, selectedText);
      const rewrittenSelection = await llm.invoke([
        new SystemMessage(
          input.target === "structured_outline"
            ? "你是严谨的 JSON 局部编辑器。任务是“只改写目标片段”。必须保持原有 JSON 语义、字段含义和层级结构。不要输出解释、不要代码块、不要新增片段外内容，只返回可直接替换原片段的文本。"
            : "你是小说编辑，执行“局部改写”任务。只允许改写目标片段，不得扩写到其他段落。改写后必须与原片段主题、实体、事件关系保持一致；若是列表项，返回单条同类型列表项。不要输出解释或标题，只返回改写片段。",
        ),
        new HumanMessage(
          `用户修正指令：
${input.instruction}

核心角色：
${charactersText}

世界上下文：
${worldContext}

片段前文（仅供理解，不可改写）：
${selectionContext.before || "（无）"}

片段后文（仅供理解，不可改写）：
${selectionContext.after || "（无）"}

待改写片段：
${selectedText}

输出要求：
1. 只输出“待改写片段”的改写结果。
2. 不要输出前文/后文，不要解释说明。
3. 若与指令冲突，以“待改写片段的原始语义 + 用户修正指令”为最高优先级。`,
        ),
      ]);
      const optimizedSelection = toText(rewrittenSelection.content).trim() || selectedText;
      return {
        optimizedDraft: optimizedSelection,
        mode: "selection",
        selectedText,
      };
    }

    const rewritten = await llm.invoke([
      new SystemMessage(
        input.target === "structured_outline"
          ? "你是结构化小说大纲编辑器。基于用户指令优化 JSON 草稿。必须只返回 JSON 数组，不要附加解释文字。"
          : "你是小说策划编辑。基于用户指令优化发展走向草稿，保持角色设定和世界规则一致。",
      ),
      new HumanMessage(
        `用户修正指令：
${input.instruction}

核心角色：
${charactersText}

世界上下文：
${worldContext}

当前草稿：
${currentDraft}`,
      ),
    ]);

    let optimizedDraft = toText(rewritten.content).trim() || currentDraft;
    if (input.target === "structured_outline") {
      try {
        const jsonText = extractJSONArray(optimizedDraft);
        JSON.parse(jsonText);
        optimizedDraft = jsonText;
      } catch {
        // keep raw response for manual correction when model output is non-JSON
      }
    }
    return {
      optimizedDraft,
      mode: "full",
      selectedText: null,
    };
  }
}
