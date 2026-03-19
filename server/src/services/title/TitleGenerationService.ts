import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { prisma } from "../../db/prisma";
import { supportsForcedJsonOutput } from "../../llm/capabilities";
import { getLLM } from "../../llm/factory";
import { buildTitleGenerationMessages } from "./titlePromptBuilder";
import {
  collectUniqueSuggestions,
  DEFAULT_TITLE_COUNT,
  extractJsonPayload,
  hasEnoughStyleVariety,
  normalizeRequestedCount,
  readMessageContent,
  toTrimmedString,
  type TitlePromptContext,
} from "./titleGeneration.shared";

export interface TitleGenerationLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTitleIdeasInput extends TitleGenerationLLMOptions {
  mode: "brief" | "adapt";
  brief?: string;
  referenceTitle?: string;
  genreId?: string | null;
  count?: number;
}

export interface GenerateNovelTitlesInput extends TitleGenerationLLMOptions {
  count?: number;
}

function resolveRetryReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function parseModelTitles(rawText: string): unknown[] {
  const parsed = JSON.parse(extractJsonPayload(rawText)) as unknown;
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { titles?: unknown }).titles)) {
    return (parsed as { titles: unknown[] }).titles;
  }
  throw new Error("模型输出缺少 titles 数组。");
}

function buildNovelBrief(novel: {
  title: string;
  description: string | null;
  genre?: { name: string; description: string | null } | null;
}): string {
  const parts = [
    novel.description?.trim() ? `作品简介：${novel.description.trim()}` : "",
    novel.genre?.name ? `题材方向：${novel.genre.name}` : "",
    novel.genre?.description?.trim() ? `题材补充：${novel.genre.description.trim()}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join("\n");
  }
  return `项目标题：${novel.title}`;
}

export class TitleGenerationService {
  async generateTitleIdeas(input: GenerateTitleIdeasInput): Promise<{ titles: TitleFactorySuggestion[] }> {
    const mode = input.mode;
    const brief = toTrimmedString(input.brief);
    const referenceTitle = toTrimmedString(input.referenceTitle);
    const count = normalizeRequestedCount(input.count, DEFAULT_TITLE_COUNT);

    if (mode === "brief" && !brief) {
      throw new Error("自由标题工坊需要提供创作简报。");
    }
    if (mode === "adapt" && !referenceTitle) {
      throw new Error("参考标题改编模式需要提供参考标题。");
    }

    const genre = input.genreId
      ? await prisma.novelGenre.findUnique({
        where: { id: input.genreId },
        select: { id: true, name: true, description: true },
      })
      : null;

    return this.runGeneration({
      mode,
      count,
      brief: brief || `请围绕参考标题「${referenceTitle}」做结构学习式改编，产出原创标题。`,
      referenceTitle,
      novelTitle: "",
      currentTitle: "",
      genreName: genre?.name ?? "",
      genreDescription: genre?.description ?? "",
    }, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });
  }

  async generateNovelTitles(novelId: string, input: GenerateNovelTitlesInput = {}): Promise<{ titles: TitleFactorySuggestion[] }> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        genre: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const brief = buildNovelBrief(novel);

    return this.runGeneration({
      mode: "novel",
      count: normalizeRequestedCount(input.count, DEFAULT_TITLE_COUNT),
      brief,
      referenceTitle: "",
      novelTitle: novel.title,
      currentTitle: novel.title,
      genreName: novel.genre?.name ?? "",
      genreDescription: novel.genre?.description ?? "",
    }, input, novel.title ? [novel.title] : []);
  }

  private async runGeneration(
    promptContext: TitlePromptContext,
    llmOptions: TitleGenerationLLMOptions,
    blockedTitles: string[] = [],
  ): Promise<{ titles: TitleFactorySuggestion[] }> {
    const provider = llmOptions.provider ?? "deepseek";
    const forceJson = supportsForcedJsonOutput(provider, llmOptions.model);
    const count = normalizeRequestedCount(promptContext.count, DEFAULT_TITLE_COUNT);
    const llm = await getLLM(provider, {
      model: llmOptions.model,
      temperature: llmOptions.temperature ?? 0.85,
      maxTokens: llmOptions.maxTokens,
      taskType: "planner",
    });

    let lastError: unknown;
    let bestEffortTitles: TitleFactorySuggestion[] = [];
    let retryReason: string | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await llm.invoke(buildTitleGenerationMessages({
          ...promptContext,
          count,
        }, {
          forceJson,
          retryReason,
        }));
        const rawText = readMessageContent(result.content);
        const rawTitles = parseModelTitles(rawText);
        const titles = collectUniqueSuggestions(rawTitles, count, blockedTitles);

        if (titles.length > bestEffortTitles.length) {
          bestEffortTitles = titles;
        }

        if (titles.length < count) {
          throw new Error(`标题数量不足，目标 ${count} 个，实际仅 ${titles.length} 个可用标题。`);
        }
        if (!hasEnoughStyleVariety(titles, count)) {
          throw new Error("标题风格分布过窄，未达到最少风格覆盖要求。");
        }

        return { titles };
      } catch (error) {
        lastError = error;
        retryReason = resolveRetryReason(error, "输出不符合 JSON 或标题质量要求");
      }
    }

    if (bestEffortTitles.length >= Math.max(5, Math.floor(count * 0.7))) {
      return { titles: bestEffortTitles };
    }

    if (lastError instanceof Error) {
      throw new Error(`标题生成失败：${lastError.message}`);
    }
    throw new Error("标题生成失败。");
  }
}

export const titleGenerationService = new TitleGenerationService();
