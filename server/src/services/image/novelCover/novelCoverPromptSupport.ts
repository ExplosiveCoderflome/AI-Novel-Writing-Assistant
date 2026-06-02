import {
  buildDefaultNovelCoverSourceDescription,
  buildNovelCoverImagePrompt,
  type NovelCoverImagePromptNovelContext,
} from "@ai-novel/shared/imagePrompt";
import { parseCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";
import { storyWorldSliceSchema } from "@ai-novel/shared/types/storyWorldSlice";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt, runTextPrompt } from "../../../prompting/core/promptRunner";
import {
  imageNovelCoverBriefPrompt,
  imageNovelCoverPromptOptimizePrompt,
} from "../../../prompting/prompts/image/image.prompts";
import type {
  ImagePromptOutputLanguage,
  OptimizeNovelCoverImagePromptRequest,
} from "../types";
import { WorldContextGateway, type WorldContextBlock } from "../../novel/worldContext/WorldContextGateway";

interface NovelCoverNovelRecord {
  id: string;
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  commercialTagsJson: string | null;
  styleTone: string | null;
  narrativePov: string | null;
  pacePreference: string | null;
  emotionIntensity: string | null;
  storyWorldSliceJson: string | null;
  genre: { name: string | null } | null;
  primaryStoryMode: { name: string | null } | null;
  secondaryStoryMode: { name: string | null } | null;
  world: { name: string | null } | null;
}

const NARRATIVE_POV_LABELS: Record<string, string> = {
  first_person: "第一人称",
  third_person: "第三人称",
  mixed: "混合视角",
};

const PACE_PREFERENCE_LABELS: Record<string, string> = {
  slow: "慢节奏",
  balanced: "均衡节奏",
  fast: "快节奏",
};

const EMOTION_INTENSITY_LABELS: Record<string, string> = {
  low: "低情绪浓度",
  medium: "中情绪浓度",
  high: "高情绪浓度",
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseCommercialTags(value: string | null | undefined): string[] {
  return parseCommercialTagsJson(value);
}

function parseWorldSummary(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = storyWorldSliceSchema.parse(JSON.parse(value) as unknown);
    return normalizeOptionalText(parsed.coreWorldFrame);
  } catch {
    return null;
  }
}

function buildWorldSummaryFromContext(block: WorldContextBlock | null | undefined): string | null {
  if (!block) {
    return null;
  }
  const parts = [
    normalizeOptionalText(block.summaryText),
    block.activeForces.length > 0
      ? `活跃势力：${block.activeForces.slice(0, 3).map((force) => force.name).join("、")}`
      : null,
    block.activeLocations.length > 0
      ? `本书舞台：${block.activeLocations.slice(0, 3).map((location) => location.name).join("、")}`
      : null,
  ].filter((item): item is string => Boolean(item));
  return normalizeOptionalText(parts.join("；"));
}

function buildNarrativeLabel(mapping: Record<string, string>, value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? (mapping[normalized] ?? normalized) : null;
}

export function toNovelCoverPromptContext(
  novel: NovelCoverNovelRecord,
  worldContext?: WorldContextBlock | null,
): NovelCoverImagePromptNovelContext {
  const worldContextSummary = buildWorldSummaryFromContext(worldContext);
  return {
    title: novel.title,
    description: normalizeOptionalText(novel.description),
    targetAudience: normalizeOptionalText(novel.targetAudience),
    bookSellingPoint: normalizeOptionalText(novel.bookSellingPoint),
    competingFeel: normalizeOptionalText(novel.competingFeel),
    first30ChapterPromise: normalizeOptionalText(novel.first30ChapterPromise),
    commercialTags: parseCommercialTags(novel.commercialTagsJson),
    genreLabel: normalizeOptionalText(novel.genre?.name),
    primaryStoryModeLabel: normalizeOptionalText(novel.primaryStoryMode?.name),
    secondaryStoryModeLabel: normalizeOptionalText(novel.secondaryStoryMode?.name),
    worldName: normalizeOptionalText(novel.world?.name),
    worldSummary: worldContextSummary ?? parseWorldSummary(novel.storyWorldSliceJson),
    styleTone: normalizeOptionalText(novel.styleTone),
    narrativePovLabel: buildNarrativeLabel(NARRATIVE_POV_LABELS, novel.narrativePov),
    pacePreferenceLabel: buildNarrativeLabel(PACE_PREFERENCE_LABELS, novel.pacePreference),
    emotionIntensityLabel: buildNarrativeLabel(EMOTION_INTENSITY_LABELS, novel.emotionIntensity),
  };
}

export async function loadNovelCoverNovel(novelId: string): Promise<NovelCoverNovelRecord> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      title: true,
      description: true,
      targetAudience: true,
      bookSellingPoint: true,
      competingFeel: true,
      first30ChapterPromise: true,
      commercialTagsJson: true,
      styleTone: true,
      narrativePov: true,
      pacePreference: true,
      emotionIntensity: true,
      storyWorldSliceJson: true,
      genre: {
        select: {
          name: true,
        },
      },
      primaryStoryMode: {
        select: {
          name: true,
        },
      },
      secondaryStoryMode: {
        select: {
          name: true,
        },
      },
      world: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!novel) {
    throw new AppError("Novel not found.", 404);
  }
  return novel;
}

async function loadNovelCoverWorldContext(novelId: string): Promise<WorldContextBlock | null> {
  return new WorldContextGateway().getWorldContextBlock(novelId, {
    purpose: "optimize",
    strength: "light",
  });
}

export async function buildNovelCoverSourcePrompt(novelId: string): Promise<string> {
  const [novel, worldContext] = await Promise.all([
    loadNovelCoverNovel(novelId),
    loadNovelCoverWorldContext(novelId),
  ]);
  return buildDefaultNovelCoverSourceDescription(toNovelCoverPromptContext(novel, worldContext));
}

export async function buildNovelCoverTaskPrompt(input: {
  novelId: string;
  sourcePrompt: string;
  stylePreset?: string | null;
}): Promise<string> {
  const [novel, worldContext] = await Promise.all([
    loadNovelCoverNovel(input.novelId),
    loadNovelCoverWorldContext(input.novelId),
  ]);
  return buildNovelCoverImagePrompt({
    prompt: input.sourcePrompt.trim(),
    stylePreset: input.stylePreset,
    novel: toNovelCoverPromptContext(novel, worldContext),
  });
}

export async function optimizeNovelCoverPrompt(
  input: OptimizeNovelCoverImagePromptRequest,
): Promise<{ prompt: string; outputLanguage: ImagePromptOutputLanguage }> {
  const [novel, worldContext] = await Promise.all([
    loadNovelCoverNovel(input.novelId),
    loadNovelCoverWorldContext(input.novelId),
  ]);
  const promptContext = toNovelCoverPromptContext(novel, worldContext);
  const structured = await runStructuredPrompt({
    asset: imageNovelCoverBriefPrompt,
    promptInput: {
      sourcePrompt: input.sourcePrompt.trim(),
      stylePreset: input.stylePreset?.trim(),
      title: promptContext.title,
      description: promptContext.description,
      targetAudience: promptContext.targetAudience,
      bookSellingPoint: promptContext.bookSellingPoint,
      competingFeel: promptContext.competingFeel,
      first30ChapterPromise: promptContext.first30ChapterPromise,
      commercialTags: promptContext.commercialTags ?? [],
      genreLabel: promptContext.genreLabel,
      primaryStoryModeLabel: promptContext.primaryStoryModeLabel,
      secondaryStoryModeLabel: promptContext.secondaryStoryModeLabel,
      worldName: promptContext.worldName,
      worldSummary: promptContext.worldSummary,
      styleTone: promptContext.styleTone,
      narrativePovLabel: promptContext.narrativePovLabel,
      pacePreferenceLabel: promptContext.pacePreferenceLabel,
      emotionIntensityLabel: promptContext.emotionIntensityLabel,
    },
    options: {
      temperature: 0.4,
    },
  });

  const result = await runTextPrompt({
    asset: imageNovelCoverPromptOptimizePrompt,
    promptInput: {
      sourcePrompt: input.sourcePrompt.trim(),
      stylePreset: input.stylePreset?.trim(),
      outputLanguage: input.outputLanguage,
      title: promptContext.title,
      structuredBrief: structured.output,
    },
    options: {
      temperature: 0.4,
    },
  });

  return {
    prompt: result.output.trim(),
    outputLanguage: input.outputLanguage,
  };
}
