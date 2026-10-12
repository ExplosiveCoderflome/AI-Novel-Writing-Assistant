import {
  type BookFramingSuggestion,
  type BookFramingSuggestionInput,
} from "@ai-novel/shared/types/novelFraming";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { novelFramingSuggestionPrompt } from "../../prompting/prompts/novel/framing.prompts";
import { novelReferenceService } from "./NovelReferenceService";

function buildInputSummary(input: BookFramingSuggestionInput): string {
  return [
    input.title?.trim() ? `书名：${input.title.trim()}` : "",
    input.description?.trim() ? `一句话概述：${input.description.trim()}` : "",
    input.genreLabel?.trim() ? `作品类型：${input.genreLabel.trim()}` : "",
    input.styleTone?.trim() ? `当前文风关键词：${input.styleTone.trim()}` : "",
    input.referenceIntent === "continuation"
      ? "创作意图：续写原作，读者与卖点必须承接原作未完线索与终局人物状态。"
      : input.referenceIntent === "adaptation"
        ? "创作意图：参考创作新书，只继承结构、节奏与阅读体验，必须形成独立故事。"
        : "",
  ].filter(Boolean).join("\n");
}

export class NovelFramingSuggestionService {
  async suggest(input: BookFramingSuggestionInput): Promise<BookFramingSuggestion> {
    if (!input.title?.trim() && !input.description?.trim() && !input.bookAnalysisId?.trim()) {
      throw new Error("请至少填写书名或一句话概述后再让 AI 帮你填写。");
    }

    const referenceIntent = input.referenceIntent
      ?? (input.bookAnalysisId?.trim() ? "adaptation" : undefined);
    const analysisContext = input.bookAnalysisId?.trim() && referenceIntent
      ? await novelReferenceService.buildFramingReferenceFromAnalysisId(
        input.bookAnalysisId.trim(),
        referenceIntent,
        input.bookAnalysisSections,
      )
      : "";

    if (input.bookAnalysisId?.trim() && !analysisContext.trim()) {
      throw new Error("绑定的拆书结论暂时读不到，请先确认拆书已完成并含有可读结论。");
    }

    const inputSummary = buildInputSummary(input);
    const result = await runStructuredPrompt({
      asset: novelFramingSuggestionPrompt,
      promptInput: {
        inputSummary,
        analysisContext: analysisContext.trim() || undefined,
        referenceIntent,
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
