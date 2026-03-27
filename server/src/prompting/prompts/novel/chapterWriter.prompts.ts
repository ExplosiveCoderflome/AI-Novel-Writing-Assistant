import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface ChapterWriterPromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
}

export const chapterWriterPrompt: PromptAsset<ChapterWriterPromptInput, string, string> = {
  id: "novel.chapter.writer",
  version: "v1",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterWriter,
    requiredGroups: [
      "chapter_mission",
      "volume_window",
      "participant_subset",
      "local_state",
    ],
    preferredGroups: [
      "open_conflicts",
      "recent_chapters",
      "opening_constraints",
    ],
    dropOrder: [
      "style_constraints",
      "continuation_constraints",
      "opening_constraints",
    ],
  },
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇网络小说写作助手。",
      "请直接输出本章正文，不要输出标题、提纲、解释或任何额外文本。",
      "",
      "硬性要求：",
      "1. 必须推进新的剧情动作，不能复述已经完成的事件。",
      "2. 必须服从 chapter mission、mustAdvance、mustPreserve 和 ending hook。",
      "3. 不得引入新的核心角色、世界规则或与上下文冲突的重大设定。",
      "4. 章节开头必须与最近章节保持明显区分，不能复用同类开场模板。",
      "5. 允许短回调，但不得大段复制上下文原句。",
      "6. 若存在 style constraints 或 continuation constraints，视为强约束。",
      "",
      "输出目标：",
      "1. 使用简体中文。",
      "2. 写成可直接阅读的章节正文。",
      "3. 结尾必须留下新的悬念、决策点或压力升级。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章 ${input.chapterTitle}`,
      "",
      "写作上下文：",
      renderSelectedContextBlocks(context),
      "",
      "只输出章节正文。",
    ].join("\n")),
  ],
};
