import type {
  DirectorIdeaInspirationRequest,
  DirectorIdeaInspirationsResponse,
} from "@ai-novel/shared/types/novelDirector";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { directorIdeaInspirationPrompt } from "../../../../prompting/prompts/novel/ideaInspiration.prompts";
import { buildBookFramingSummary } from "../../bookFraming";

function compactText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function line(label: string, value: string | null | undefined): string {
  const text = compactText(value);
  return text ? `${label}：${text}` : "";
}

function readerChannelPreferenceLabel(value: DirectorIdeaInspirationRequest["readerChannelPreference"]): string {
  switch (value) {
    case "ai_judge":
      return "AI 判断";
    case "male_oriented":
      return "男频向";
    case "female_oriented":
      return "女频向";
    case "general":
      return "泛读者 / 不限定";
    default:
      return "";
  }
}

function buildContextSummary(input: DirectorIdeaInspirationRequest): string {
  const framing = buildBookFramingSummary({
    targetAudience: input.targetAudience,
    bookSellingPoint: input.bookSellingPoint,
    competingFeel: input.competingFeel,
    first30ChapterPromise: input.first30ChapterPromise,
    commercialTags: input.commercialTags,
  });
  return [
    line("当前输入框草稿", input.currentIdea),
    line("暂定标题", input.title),
    line("已有概述", input.description),
    line("题材基底", input.genreLabel ?? input.genreId),
    line("主推进模式", input.primaryStoryModeLabel ?? input.primaryStoryModeId),
    line("副推进模式", input.secondaryStoryModeLabel ?? input.secondaryStoryModeId),
    line("世界观", input.worldName ?? input.worldId),
    line("读者频道倾向", readerChannelPreferenceLabel(input.readerChannelPreference)),
    input.narrativePov ? `叙事视角：${input.narrativePov}` : "",
    input.pacePreference ? `节奏偏好：${input.pacePreference}` : "",
    input.emotionIntensity ? `情绪浓度：${input.emotionIntensity}` : "",
    line("文风关键词", input.styleTone),
    framing ? `书级 framing：\n${framing}` : "",
  ].filter(Boolean).join("\n");
}

export class NovelDirectorIdeaInspirationService {
  async generate(input: DirectorIdeaInspirationRequest): Promise<DirectorIdeaInspirationsResponse> {
    const result = await runStructuredPrompt({
      asset: directorIdeaInspirationPrompt,
      promptInput: {
        contextSummary: buildContextSummary(input),
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.max(0.6, input.temperature ?? 0.8),
      },
    });

    return {
      ideas: result.output.ideas.map((idea) => ({
        angle: idea.angle.trim(),
        text: idea.text.trim(),
        tags: idea.tags.map((tag) => tag.trim()).filter(Boolean),
      })),
    };
  }
}

export const novelDirectorIdeaInspirationService = new NovelDirectorIdeaInspirationService();
