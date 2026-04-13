import {
  type BookFramingSuggestion,
  type BookFramingSuggestionInput,
} from "@ai-novel/shared/types/novelFraming";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { novelFramingSuggestionPrompt } from "../../prompting/prompts/novel/framing.prompts";

function buildInputSummary(input: BookFramingSuggestionInput): string {
  return [
    input.title?.trim() ? `书名：${input.title.trim()}` : "",
    input.description?.trim() ? `一句话概述：${input.description.trim()}` : "",
    input.genreLabel?.trim() ? `作品类型：${input.genreLabel.trim()}` : "",
    input.styleTone?.trim() ? `当前文风关键词：${input.styleTone.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export class NovelFramingSuggestionService {
  async suggest(input: BookFramingSuggestionInput): Promise<BookFramingSuggestion> {
    if (!input.title?.trim() && !input.description?.trim()) {
      throw new Error("请至少填写书名或一句话概述后再让 AI 帮你填写。");
    }

    const inputSummary = buildInputSummary(input);
    const result = await runStructuredPrompt({
      asset: novelFramingSuggestionPrompt,
      promptInput: {
        inputSummary,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.5, 0.8),
      },
    });
    return result.output;
  }
}

export const novelFramingSuggestionService = new NovelFramingSuggestionService();
