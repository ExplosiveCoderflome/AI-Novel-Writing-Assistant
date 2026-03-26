import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { normalizeCommercialTags, type BookFramingSuggestion } from "@ai-novel/shared/types/novelFraming";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelFramingSuggestionPromptInput {
  inputSummary: string;
}

export const novelFramingSuggestionSchema = z.object({
  targetAudience: z.string().trim().min(1),
  commercialTags: z.array(z.string().trim().min(1).max(20)).min(3).max(6),
  competingFeel: z.string().trim().min(1),
  bookSellingPoint: z.string().trim().min(1),
  first30ChapterPromise: z.string().trim().min(1),
});

function normalizeSuggestion(
  suggestion: z.infer<typeof novelFramingSuggestionSchema>,
): BookFramingSuggestion {
  const commercialTags = normalizeCommercialTags(suggestion.commercialTags);
  if (commercialTags.length < 3) {
    throw new Error("书级 framing 建议中的商业标签数量不足。");
  }
  return {
    targetAudience: suggestion.targetAudience.trim(),
    commercialTags,
    competingFeel: suggestion.competingFeel.trim(),
    bookSellingPoint: suggestion.bookSellingPoint.trim(),
    first30ChapterPromise: suggestion.first30ChapterPromise.trim(),
  };
}

export const novelFramingSuggestionPrompt: PromptAsset<
  NovelFramingSuggestionPromptInput,
  BookFramingSuggestion,
  z.infer<typeof novelFramingSuggestionSchema>
> = {
  id: "novel.framing.suggest",
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
  outputSchema: novelFramingSuggestionSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说项目立项助手，服务对象是不懂策划和网文结构的小白作者。",
      "你的任务是根据用户已填写的书名、故事概述和少量上下文，补全这本书的书级 framing。",
      "输出必须帮助用户直接回填表单，措辞要直白、具体、易懂，不要写专家术语，不要写空话。",
      "如果输入信息不充分，可以做谨慎推断，但不要捏造具体世界规则、复杂角色名单或正文细节。",
      "请只输出 JSON 对象，字段必须是：",
      "{\"targetAudience\":\"...\",\"commercialTags\":[\"...\"],\"competingFeel\":\"...\",\"bookSellingPoint\":\"...\",\"first30ChapterPromise\":\"...\"}",
      "要求：",
      "1. targetAudience 要说明这本书主要写给谁看。",
      "2. commercialTags 给 3-6 个短标签，每个标签不超过 20 个字符。",
      "3. competingFeel 要写成读者会感受到的阅读感，不要直接模仿具体作品。",
      "4. bookSellingPoint 要说清楚这本书最抓人的点。",
      "5. first30ChapterPromise 要明确前 30 章一定要兑现什么，不要泛泛而谈。",
      "6. 不要输出额外解释、标题或 Markdown。",
    ].join("\n")),
    new HumanMessage([
      "请根据下面这本小说的已知信息，生成可直接回填的书级 framing。",
      "",
      input.inputSummary,
    ].join("\n")),
  ],
  postValidate: (output) => normalizeSuggestion(output),
};
