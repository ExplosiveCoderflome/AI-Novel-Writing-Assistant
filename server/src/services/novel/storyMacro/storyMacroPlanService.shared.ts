import type { StoryMacroField, StoryMacroFieldValue, StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { NovelStoryMode } from "@ai-novel/shared/types/storyMode";
import { buildBookFramingSummary } from "../bookFraming";
import { buildStoryModePromptBlock } from "../../storyMode/storyModeProfile";
import {
  EMPTY_DECOMPOSITION,
  EMPTY_EXPANSION,
  type StoryMacroEditablePlan,
  normalizeConflictLayers,
  normalizeConstraints,
  normalizeDecomposition,
  normalizeExpansion,
} from "./storyMacroPlanUtils";

export interface StoryMacroNovelContext {
  id: string;
  title: string;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  commercialTagsJson: string | null;
  styleTone: string | null;
  narrativePov: string | null;
  pacePreference: string | null;
  emotionIntensity: string | null;
  estimatedChapterCount: number | null;
  genre: { name: string } | null;
  primaryStoryMode: NovelStoryMode | null;
  secondaryStoryMode: NovelStoryMode | null;
}

export function formatProjectContext(novel: StoryMacroNovelContext, worldSliceContext = ""): string {
  const bookFramingSummary = buildBookFramingSummary(novel);
  const storyModeBlock = buildStoryModePromptBlock({
    primary: novel.primaryStoryMode,
    secondary: novel.secondaryStoryMode,
  });

  return [
    novel.title ? `项目标题：${novel.title}` : "",
    novel.genre?.name ? `预设题材：${novel.genre.name}` : "",
    bookFramingSummary ? `书级 framing：\n${bookFramingSummary}` : "",
    storyModeBlock,
    novel.styleTone ? `风格倾向：${novel.styleTone}` : "",
    novel.narrativePov ? `叙事人称：${novel.narrativePov}` : "",
    novel.pacePreference ? `节奏偏好：${novel.pacePreference}` : "",
    novel.emotionIntensity ? `情绪强度：${novel.emotionIntensity}` : "",
    novel.estimatedChapterCount ? `预计章节数：${novel.estimatedChapterCount}` : "",
    worldSliceContext.trim(),
  ].filter(Boolean).join("\n");
}

export function toEditablePlan(plan: StoryMacroPlan | null | undefined): StoryMacroEditablePlan {
  return {
    expansion: normalizeExpansion(plan?.expansion ?? EMPTY_EXPANSION),
    decomposition: normalizeDecomposition(plan?.decomposition ?? EMPTY_DECOMPOSITION),
    constraints: normalizeConstraints(plan?.constraints ?? []),
  };
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeRegeneratedFieldValue(field: StoryMacroField, value: unknown): StoryMacroFieldValue {
  if (field === "conflict_layers") {
    const layers = normalizeConflictLayers(value);
    if (!layers.external || !layers.internal || !layers.relational) {
      throw new Error("AI 未返回完整的冲突层。");
    }
    return layers;
  }
  if (field === "major_payoffs" || field === "setpiece_seeds" || field === "constraints") {
    const arrayValue = field === "constraints"
      ? normalizeConstraints(value)
      : normalizeStringList(value, field === "setpiece_seeds" ? 3 : 5);
    if (arrayValue.length === 0) {
      throw new Error(`AI 未返回有效的 ${field} 列表。`);
    }
    return arrayValue;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI 未返回有效的 ${field}。`);
  }
  return value.trim();
}
