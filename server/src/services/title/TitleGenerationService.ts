import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { prisma } from "../../db/prisma";
import { resolveLLMClientOptions } from "../../llm/factory";
import { selectStructuredOutputStrategy } from "../../llm/structuredOutput";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { titleGenerationPrompt } from "../../prompting/prompts/helper/titleGeneration.prompt";
import {
  collectUniqueSuggestions,
  DEFAULT_TITLE_COUNT,
  detectTitleSurfaceFrame,
  hasEnoughStructuralVariety,
  hasEnoughStyleVariety,
  normalizeRequestedCount,
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

async function shouldForceTitleJsonOutput(input: TitleGenerationLLMOptions): Promise<boolean> {
  const resolved = await resolveLLMClientOptions(input.provider ?? "deepseek", {
    model: input.model,
    temperature: input.temperature ?? 0.85,
    maxTokens: input.maxTokens,
    taskType: titleGenerationPrompt.taskType,
    executionMode: "structured",
  });
  const profile = resolved.structuredProfile;
  if (!profile || !titleGenerationPrompt.outputSchema) {
    return false;
  }
  return selectStructuredOutputStrategy(profile, titleGenerationPrompt.outputSchema) !== "prompt_json";
}

function resolveRetryReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function extractRawTitlesFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as { titles?: unknown }).titles)) {
    return (payload as { titles: unknown[] }).titles;
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
    novel.genre?.name ? `题材基底：${novel.genre.name}` : "",
    novel.genre?.description?.trim() ? `题材补充：${novel.genre.description.trim()}` : "",
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join("\n");
  }
  return `项目标题：${novel.title}`;
}

function batchScore(titles: TitleFactorySuggestion[]): number {
  if (titles.length === 0) {
    return 0;
  }

  const styleCount = new Set(titles.map((item) => item.style)).size;
  const frameCount = new Set(titles.map((item) => detectTitleSurfaceFrame(item.title))).size;
  const totalClickRate = titles.reduce((sum, item) => sum + item.clickRate, 0);

  return titles.length * 1000 + styleCount * 100 + frameCount * 100 + totalClickRate;
}

function isBetterBatch(current: TitleFactorySuggestion[], challenger: TitleFactorySuggestion[]): boolean {
  return batchScore(challenger) > batchScore(current);
}

function ensureGenerationQuality(titles: TitleFactorySuggestion[], targetCount: number): void {
  if (titles.length < targetCount) {
    throw new Error(`标题数量不足，目标 ${targetCount} 个，实际仅有 ${titles.length} 个可用标题。`);
  }
  if (!hasEnoughStyleVariety(titles, targetCount)) {
    throw new Error("标题风格分布过窄，未达到最低风格覆盖要求。");
  }
  if (!hasEnoughStructuralVariety(titles, targetCount)) {
    throw new Error("标题句式框架过于集中，缺少足够的结构多样性。");
  }
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
      throw new Error("参考标题改写模式需要提供参考标题。");
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
      brief: brief || `请围绕参考标题《${referenceTitle}》做结构学习式改写，产出原创标题。`,
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

  async generateNovelTitles(
    novelId: string,
    input: GenerateNovelTitlesInput = {},
  ): Promise<{ titles: TitleFactorySuggestion[] }> {
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
    const forceJson = await shouldForceTitleJsonOutput(llmOptions);
    const count = normalizeRequestedCount(promptContext.count, DEFAULT_TITLE_COUNT);

    let lastError: unknown;
    let bestEffortTitles: TitleFactorySuggestion[] = [];
    let retryReason: string | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const payload = await runStructuredPrompt({
          asset: titleGenerationPrompt,
          promptInput: {
            context: {
              ...promptContext,
              count,
            },
            forceJson,
            retryReason,
          },
          options: {
            provider,
            model: llmOptions.model,
            temperature: llmOptions.temperature ?? 0.85,
            maxTokens: llmOptions.maxTokens,
          },
        });

        const rawTitles = extractRawTitlesFromPayload(payload.output);
        const titles = collectUniqueSuggestions(rawTitles, count, blockedTitles);

        if (isBetterBatch(bestEffortTitles, titles)) {
          bestEffortTitles = titles;
        }

        ensureGenerationQuality(titles, count);
        return { titles };
      } catch (error) {
        lastError = error;
        retryReason = resolveRetryReason(error, "输出不符合 JSON 或标题质量要求。");
      }
    }

    const minimumAcceptableCount = Math.max(5, Math.floor(count * 0.8));
    if (
      bestEffortTitles.length >= minimumAcceptableCount
      && hasEnoughStyleVariety(bestEffortTitles, bestEffortTitles.length)
      && hasEnoughStructuralVariety(bestEffortTitles, bestEffortTitles.length)
    ) {
      return { titles: bestEffortTitles };
    }

    if (lastError instanceof Error) {
      throw new Error(`标题生成失败：${lastError.message}`);
    }
    throw new Error("标题生成失败。");
  }
}

export const titleGenerationService = new TitleGenerationService();
