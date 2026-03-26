import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelContinuationRewritePromptInput {
  chapterTitle: string;
  mostSimilarSnippet: string;
  targetText: string;
}

export const novelContinuationRewritePrompt: PromptAsset<NovelContinuationRewritePromptInput, string, string> = {
  id: "novel.continuation.rewrite_similarity",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      "你是续写重写编辑。输出必须是简体中文完整章节。保持角色关系和事件因果连续，但必须重构冲突路径、场景触发、动作链和句式表达，禁止复刻前作桥段与措辞。",
    ),
    new HumanMessage(
      `章节标题：${input.chapterTitle}
相似风险来源（仅用于避让，不可照抄）：
${input.mostSimilarSnippet}

当前章节全文：
${input.targetText}

请重写完整章节，要求：
1. 保留本章核心推进方向与结尾钩子。
2. 与前作高相似桥段保持明显区隔（冲突类型、推进顺序、关键动作不同）。
3. 禁止输出解释，只输出重写后的正文。`,
    ),
  ],
};
