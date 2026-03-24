import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  normalizeCommercialTags,
  type BookFramingSuggestion,
  type BookFramingSuggestionInput,
} from "@ai-novel/shared/types/novelFraming";
import { z } from "zod";
import { getLLM } from "../../llm/factory";

const suggestionSchema = z.object({
  targetAudience: z.string().trim().min(1),
  commercialTags: z.array(z.string().trim().min(1).max(20)).min(3).max(6),
  competingFeel: z.string().trim().min(1),
  bookSellingPoint: z.string().trim().min(1),
  first30ChapterPromise: z.string().trim().min(1),
});

function toLlmText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
        return (item as { text: string }).text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

function extractJsonObject<T>(content: string): T {
  const cleaned = content.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("未解析到合法 JSON。");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function buildInputSummary(input: BookFramingSuggestionInput): string {
  return [
    input.title?.trim() ? `书名：${input.title.trim()}` : "",
    input.description?.trim() ? `一句话概述：${input.description.trim()}` : "",
    input.genreLabel?.trim() ? `作品类型：${input.genreLabel.trim()}` : "",
    input.styleTone?.trim() ? `当前文风关键词：${input.styleTone.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeSuggestion(
  suggestion: z.infer<typeof suggestionSchema>,
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

export class NovelFramingSuggestionService {
  async suggest(input: BookFramingSuggestionInput): Promise<BookFramingSuggestion> {
    if (!input.title?.trim() && !input.description?.trim()) {
      throw new Error("请至少填写书名或一句话概述后再让 AI 帮你填写。");
    }

    const llm = await getLLM(input.provider, {
      model: input.model,
      temperature: Math.min(input.temperature ?? 0.5, 0.8),
      taskType: "planner",
    });
    const inputSummary = buildInputSummary(input);
    const systemPrompt = [
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
    ].join("\n");
    const humanPrompt = [
      "请根据下面这本小说的已知信息，生成可直接回填的书级 framing。",
      "",
      inputSummary,
    ].join("\n");

    const result = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);

    return this.parseSuggestion({
      rawContent: toLlmText(result.content),
      llmInput: input,
      inputSummary,
    });
  }

  private async parseSuggestion(input: {
    rawContent: string;
    llmInput: BookFramingSuggestionInput;
    inputSummary: string;
  }): Promise<BookFramingSuggestion> {
    const firstAttempt = suggestionSchema.safeParse(extractJsonObject(input.rawContent));
    if (firstAttempt.success) {
      return normalizeSuggestion(firstAttempt.data);
    }

    const llm = await getLLM(input.llmInput.provider, {
      model: input.llmInput.model,
      temperature: 0.2,
      taskType: "planner",
    });
    const repairPrompt = [
      "请把下面这段书级 framing 输出修复成合法 JSON。",
      "只能输出一个 JSON 对象，不要输出解释。",
      "字段必须是：targetAudience、commercialTags、competingFeel、bookSellingPoint、first30ChapterPromise。",
      "commercialTags 必须是 3-6 个短标签组成的数组。",
      "",
      "已知小说信息：",
      input.inputSummary,
      "",
      "待修复内容：",
      input.rawContent,
    ].join("\n");
    const repaired = await llm.invoke([
      new SystemMessage("你是 JSON 修复器。"),
      new HumanMessage(repairPrompt),
    ]);
    const parsed = suggestionSchema.parse(extractJsonObject(toLlmText(repaired.content)));
    return normalizeSuggestion(parsed);
  }
}

export const novelFramingSuggestionService = new NovelFramingSuggestionService();
