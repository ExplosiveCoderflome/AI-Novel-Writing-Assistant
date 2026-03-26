import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelDraftOptimizeSelectionPromptInput {
  target: "outline" | "structured_outline";
  instruction: string;
  charactersText: string;
  worldContext: string;
  before: string;
  after: string;
  selectedText: string;
}

export interface NovelDraftOptimizeFullPromptInput {
  target: "outline" | "structured_outline";
  instruction: string;
  charactersText: string;
  worldContext: string;
  currentDraft: string;
}

export const novelDraftOptimizeSelectionPrompt: PromptAsset<NovelDraftOptimizeSelectionPromptInput, string, string> = {
  id: "novel.draft_optimize.selection",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      input.target === "structured_outline"
        ? "你是严谨的 JSON 局部编辑器。任务是“只改写目标片段”。必须保持原有 JSON 语义、字段含义和层级结构。不要输出解释、不要代码块、不要新增片段外内容，只返回可直接替换原片段的文本。"
        : "你是小说编辑，执行“局部改写”任务。只允许改写目标片段，不得扩写到其他段落。改写后必须与原片段主题、实体、事件关系保持一致；若是列表项，返回单条同类型列表项。不要输出解释或标题，只返回改写片段。",
    ),
    new HumanMessage(
      `用户修正指令：
${input.instruction}

核心角色：
${input.charactersText}

世界上下文：
${input.worldContext}

片段前文（仅供理解，不可改写）：
${input.before || "（无）"}

片段后文（仅供理解，不可改写）：
${input.after || "（无）"}

待改写片段：
${input.selectedText}

输出要求：
1. 只输出“待改写片段”的改写结果。
2. 不要输出前文/后文，不要解释说明。
3. 若与指令冲突，以“待改写片段的原始语义 + 用户修正指令”为最高优先级。`,
    ),
  ],
};

export const novelDraftOptimizeFullPrompt: PromptAsset<NovelDraftOptimizeFullPromptInput, string, string> = {
  id: "novel.draft_optimize.full",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      input.target === "structured_outline"
        ? "你是结构化小说大纲编辑器。基于用户指令优化 JSON 草稿。必须只返回 JSON 数组，不要附加解释文字。"
        : "你是小说策划编辑。基于用户指令优化发展走向草稿，保持角色设定和世界规则一致。",
    ),
    new HumanMessage(
      `用户修正指令：
${input.instruction}

核心角色：
${input.charactersText}

世界上下文：
${input.worldContext}

当前草稿：
${input.currentDraft}`,
    ),
  ],
};
