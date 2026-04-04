import type {
  AIFreedom,
  EmotionIntensity,
  NarrativePov,
  NovelWritingMode,
  PacePreference,
  ProjectMode,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelCreateResourceRecommendation } from "@ai-novel/shared/types/novelResourceRecommendation";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { novelCreateResourceRecommendationPrompt } from "../../prompting/prompts/novel/resourceRecommendation.prompts";
import { ensureSystemResourceStarterData } from "../bootstrap/SystemResourceBootstrapService";
import { GenreService, type GenreTreeNode } from "../genre/GenreService";
import { StoryModeService, type StoryModeTreeNode } from "../storyMode/StoryModeService";
import { buildBookFramingSummary } from "./bookFraming";

interface RecommendNovelCreateResourcesInput {
  title?: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
  genreId?: string;
  primaryStoryModeId?: string;
  secondaryStoryModeId?: string;
  writingMode?: NovelWritingMode;
  projectMode?: ProjectMode;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface FlattenedGenreOption {
  id: string;
  name: string;
  path: string;
  description?: string | null;
  template?: string | null;
}

interface FlattenedStoryModeOption {
  id: string;
  name: string;
  path: string;
  description?: string | null;
  template?: string | null;
  profile: StoryModeTreeNode["profile"];
}

function compactText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncateText(value: string | null | undefined, maxLength = 220): string {
  const text = compactText(value);
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function flattenGenreOptions(nodes: GenreTreeNode[], path: string[] = []): FlattenedGenreOption[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    return [
      {
        id: node.id,
        name: node.name,
        path: nextPath.join(" / "),
        description: node.description,
        template: node.template,
      },
      ...flattenGenreOptions(node.children, nextPath),
    ];
  });
}

function flattenStoryModeOptions(nodes: StoryModeTreeNode[], path: string[] = []): FlattenedStoryModeOption[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    return [
      {
        id: node.id,
        name: node.name,
        path: nextPath.join(" / "),
        description: node.description,
        template: node.template,
        profile: node.profile,
      },
      ...flattenStoryModeOptions(node.children, nextPath),
    ];
  });
}

function buildGenreCatalogText(options: FlattenedGenreOption[]): string {
  return options.map((option, index) => [
    `${index + 1}. ID=${option.id}`,
    `路径：${option.path}`,
    option.description ? `说明：${option.description}` : "",
    option.template ? `使用倾向：${option.template}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function buildStoryModeCatalogText(options: FlattenedStoryModeOption[]): string {
  return options.map((option, index) => [
    `${index + 1}. ID=${option.id}`,
    `路径：${option.path}`,
    option.description ? `说明：${option.description}` : "",
    `核心驱动：${option.profile.coreDrive}`,
    `读者奖励：${option.profile.readerReward}`,
    `冲突上限：${option.profile.conflictCeiling}`,
    option.template ? `补充模板：${option.template}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function buildCurrentSelectionSummary(input: RecommendNovelCreateResourcesInput, options: {
  genres: FlattenedGenreOption[];
  storyModes: FlattenedStoryModeOption[];
}): string {
  const genre = options.genres.find((item) => item.id === input.genreId);
  const primaryStoryMode = options.storyModes.find((item) => item.id === input.primaryStoryModeId);
  const secondaryStoryMode = options.storyModes.find((item) => item.id === input.secondaryStoryModeId);

  return [
    genre ? `当前已选题材基底：${genre.path}` : "",
    primaryStoryMode ? `当前已选主推进模式：${primaryStoryMode.path}` : "",
    secondaryStoryMode ? `当前已选副推进模式：${secondaryStoryMode.path}` : "",
  ].filter(Boolean).join("\n");
}

function buildUserIntentSummary(
  input: RecommendNovelCreateResourcesInput,
  options: {
    genres: FlattenedGenreOption[];
    storyModes: FlattenedStoryModeOption[];
  },
): string {
  const bookFramingSummary = buildBookFramingSummary({
    targetAudience: input.targetAudience,
    bookSellingPoint: input.bookSellingPoint,
    competingFeel: input.competingFeel,
    first30ChapterPromise: input.first30ChapterPromise,
    commercialTags: input.commercialTags,
  });
  const currentSelectionSummary = buildCurrentSelectionSummary(input, options);

  return [
    input.title?.trim() ? `标题：${input.title.trim()}` : "",
    input.description?.trim() ? `一句话概述：${truncateText(input.description, 260)}` : "",
    input.writingMode ? `创作模式：${input.writingMode}` : "",
    input.projectMode ? `项目模式：${input.projectMode}` : "",
    input.narrativePov ? `叙事视角：${input.narrativePov}` : "",
    input.pacePreference ? `节奏偏好：${input.pacePreference}` : "",
    input.emotionIntensity ? `情绪浓度：${input.emotionIntensity}` : "",
    input.aiFreedom ? `AI 自由度：${input.aiFreedom}` : "",
    input.styleTone?.trim() ? `文风关键词：${input.styleTone.trim()}` : "",
    bookFramingSummary ? `书级 framing：\n${bookFramingSummary}` : "",
    currentSelectionSummary ? `当前手动选择：\n${currentSelectionSummary}` : "",
  ].filter(Boolean).join("\n");
}

export class NovelCreateResourceRecommendationService {
  private readonly genreService = new GenreService();

  private readonly storyModeService = new StoryModeService();

  async recommend(input: RecommendNovelCreateResourcesInput): Promise<NovelCreateResourceRecommendation> {
    await ensureSystemResourceStarterData();

    const [genreTree, storyModeTree] = await Promise.all([
      this.genreService.listGenreTree(),
      this.storyModeService.listStoryModeTree(),
    ]);

    const genreOptions = flattenGenreOptions(genreTree);
    const storyModeOptions = flattenStoryModeOptions(storyModeTree);

    if (genreOptions.length === 0 || storyModeOptions.length === 0) {
      throw new Error("系统内置资源尚未就绪，暂时无法推荐题材基底和推进模式。");
    }

    const result = await runStructuredPrompt({
      asset: novelCreateResourceRecommendationPrompt,
      promptInput: {
        userIntentSummary: buildUserIntentSummary(input, {
          genres: genreOptions,
          storyModes: storyModeOptions,
        }),
        genreCatalogText: buildGenreCatalogText(genreOptions),
        storyModeCatalogText: buildStoryModeCatalogText(storyModeOptions),
        allowedGenreIds: genreOptions.map((item) => item.id),
        allowedStoryModeIds: storyModeOptions.map((item) => item.id),
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.3, 0.5),
      },
    });

    const parsed = result.output;
    const genre = genreOptions.find((item) => item.id === parsed.genreId);
    const primaryStoryMode = storyModeOptions.find((item) => item.id === parsed.primaryStoryModeId);
    const secondaryStoryMode = parsed.secondaryStoryModeId
      ? storyModeOptions.find((item) => item.id === parsed.secondaryStoryModeId)
      : null;

    if (!genre || !primaryStoryMode) {
      throw new Error("AI 已返回推荐结果，但无法在当前资源库中找到对应项。");
    }

    return {
      summary: parsed.summary,
      genre: {
        id: genre.id,
        name: genre.name,
        path: genre.path,
        reason: parsed.genreReason,
      },
      primaryStoryMode: {
        id: primaryStoryMode.id,
        name: primaryStoryMode.name,
        path: primaryStoryMode.path,
        reason: parsed.primaryStoryModeReason,
      },
      secondaryStoryMode: secondaryStoryMode
        ? {
          id: secondaryStoryMode.id,
          name: secondaryStoryMode.name,
          path: secondaryStoryMode.path,
          reason: parsed.secondaryStoryModeReason?.trim() || "用于补充主推进模式的风味与读者奖励。",
        }
        : null,
      caution: parsed.caution?.trim() || null,
      recommendedAt: new Date().toISOString(),
    };
  }
}

export const novelCreateResourceRecommendationService = new NovelCreateResourceRecommendationService();
