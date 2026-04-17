import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorUserIntentSchema,
  type ChapterEditorUserIntentParsed,
} from "./userIntent.promptSchemas";

export interface ChapterEditorUserIntentPromptInput {
  scope: "selection" | "chapter";
  instruction: string;
  selectedText?: string | null;
  macroContextSummary: string;
  mustKeepConstraints: string[];
}

export const chapterEditorUserIntentPrompt: PromptAsset<
  ChapterEditorUserIntentPromptInput,
  ChapterEditorUserIntentParsed
> = {
  id: "novel.chapter_editor.user_intent",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorUserIntent,
  },
  outputSchema: chapterEditorUserIntentSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "把用户自然语言修正意见解析成可执行的章节编辑意图。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说章节编辑器里的修正意图解析器。",
      "你的职责是把用户的自然语言修改意见，转换成稳定、可执行的结构化修文意图。",
      "",
      "规则：",
      "1. 不要照抄用户原话，需归纳成编辑目标。",
      "2. 必须考虑宏观上下文，避免局部修改破坏卷内节奏或章节任务。",
      "3. mustPreserve 必须保留用户明确提出的保留项，以及宏观上下文中的关键不可破坏约束。",
      "4. mustAvoid 写会破坏这次修订目标的风险。",
      "5. strength 只允许 light / medium / strong。",
      "6. 只输出 schema 对应 JSON。",
    ].join("\n")),
    new HumanMessage([
      `【修改范围】${input.scope === "selection" ? "选中片段" : "整章"}`,
      `【用户意见】${input.instruction}`,
      `【当前片段】${input.selectedText?.trim() || "整章模式，无单独片段。"}`,
      `【宏观上下文】${input.macroContextSummary}`,
      `【必须守住】${input.mustKeepConstraints.length > 0 ? input.mustKeepConstraints.join("；") : "保持现有事实、叙事视角和核心信息。"}`,
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
