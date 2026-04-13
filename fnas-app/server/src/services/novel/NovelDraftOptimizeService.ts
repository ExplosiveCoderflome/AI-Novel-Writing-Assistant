import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import {
  novelDraftOptimizeFullPrompt,
  novelDraftOptimizeSelectionPrompt,
} from "../../prompting/prompts/novel/draftOptimize.prompts";

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

    if (input.mode === "selection") {
      const selectedText = input.selectedText?.trim();
      if (!selectedText) {
        throw new Error("选区优化模式下必须提供 selectedText。");
      }
      const selectionContext = buildSelectionContext(currentDraft, selectedText);
      const rewrittenSelection = await runTextPrompt({
        asset: novelDraftOptimizeSelectionPrompt,
        promptInput: {
          target: input.target,
          instruction: input.instruction,
          charactersText,
          worldContext,
          before: selectionContext.before,
          after: selectionContext.after,
          selectedText,
        },
        options: {
          provider: input.provider ?? "deepseek",
          model: input.model,
          temperature: input.temperature ?? 0.4,
        },
      });
      const optimizedSelection = rewrittenSelection.output.trim() || selectedText;
      return {
        optimizedDraft: optimizedSelection,
        mode: "selection",
        selectedText,
      };
    }

    const rewritten = await runTextPrompt({
      asset: novelDraftOptimizeFullPrompt,
      promptInput: {
        target: input.target,
        instruction: input.instruction,
        charactersText,
        worldContext,
        currentDraft,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.4,
      },
    });

    let optimizedDraft = rewritten.output.trim() || currentDraft;
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
