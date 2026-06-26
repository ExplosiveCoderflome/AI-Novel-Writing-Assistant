import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { bookAnalysisChapterSplitOutputSchema } from "../../../services/bookAnalysis/shared/bookAnalysisSchemas";

export interface BookAnalysisChapterSplitPromptInput {
  content: string;
}

export const bookAnalysisChapterSplitPrompt: PromptAsset<
  BookAnalysisChapterSplitPromptInput,
  z.infer<typeof bookAnalysisChapterSplitOutputSchema>
> = {
  id: "bookAnalysis.chapter.split",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: bookAnalysisChapterSplitOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文长文章节切分助手。",
      "你的任务是根据给定文本判断章节边界，输出章节标题和在原文中的字符 offset。",
      "只输出 JSON 对象，不要输出 Markdown 或解释。",
      "结构固定为：",
      '{ "chapters": [{ "title": "...", "startOffset": 0, "endOffset": 100 }] }',
      "规则：",
      "1. offset 使用 0-based 字符位置，startOffset 包含章节标题所在位置，endOffset 为该章结束后的第一个字符位置。",
      "2. 章节必须按原文顺序排列，不能重叠，不能越界。",
      "3. 如果无法可靠判断章节边界，返回空数组，不要硬编。",
      "4. title 使用原文里最接近章节标题的短文本。",
    ].join("\n")),
    new HumanMessage([
      "原文：",
      input.content,
    ].join("\n")),
  ],
};
