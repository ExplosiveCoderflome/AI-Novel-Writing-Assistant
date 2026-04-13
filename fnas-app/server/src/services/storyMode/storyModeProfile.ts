import { z } from "zod";
import type { NovelStoryMode, StoryModeConflictCeiling, StoryModeProfile } from "@ai-novel/shared/types/storyMode";

export const storyModeConflictCeilingSchema = z.enum(["low", "medium", "high"]);

export const storyModeProfileSchema = z.object({
  coreDrive: z.string().trim().min(1).max(300),
  readerReward: z.string().trim().min(1).max(300),
  progressionUnits: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  allowedConflictForms: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  forbiddenConflictForms: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  conflictCeiling: storyModeConflictCeilingSchema,
  resolutionStyle: z.string().trim().min(1).max(300),
  chapterUnit: z.string().trim().min(1).max(300),
  volumeReward: z.string().trim().min(1).max(300),
  mandatorySignals: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  antiSignals: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
}).strict();

const DEFAULT_STORY_MODE_PROFILE: StoryModeProfile = {
  coreDrive: "通过稳定兑现核心阅读期待来推动连载体验。",
  readerReward: "每隔数章都获得清晰、可感知的满足感。",
  progressionUnits: ["关键关系推进", "阶段性目标兑现"],
  allowedConflictForms: ["与主驱动一致的中低烈度冲突"],
  forbiddenConflictForms: ["无关的高压狗血冲突"],
  conflictCeiling: "medium",
  resolutionStyle: "优先使用符合该模式的方式化解问题，而不是强行升级。",
  chapterUnit: "每章围绕一个清晰的推进单位展开。",
  volumeReward: "卷末给出与模式一致的阶段性兑现。",
  mandatorySignals: ["主驱动持续出现", "读者期待被重复确认"],
  antiSignals: ["长期偏离主驱动", "冲突烈度失控"],
};

function normalizeText(value: unknown, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeConflictCeiling(value: unknown): StoryModeConflictCeiling {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : DEFAULT_STORY_MODE_PROFILE.conflictCeiling;
}

export function sanitizeStoryModeProfile(value: unknown): StoryModeProfile {
  if (!value || typeof value !== "object") {
    return DEFAULT_STORY_MODE_PROFILE;
  }
  const record = value as Partial<StoryModeProfile>;
  return storyModeProfileSchema.parse({
    coreDrive: normalizeText(record.coreDrive, DEFAULT_STORY_MODE_PROFILE.coreDrive),
    readerReward: normalizeText(record.readerReward, DEFAULT_STORY_MODE_PROFILE.readerReward),
    progressionUnits: normalizeList(record.progressionUnits, DEFAULT_STORY_MODE_PROFILE.progressionUnits),
    allowedConflictForms: normalizeList(record.allowedConflictForms, DEFAULT_STORY_MODE_PROFILE.allowedConflictForms),
    forbiddenConflictForms: normalizeList(record.forbiddenConflictForms, DEFAULT_STORY_MODE_PROFILE.forbiddenConflictForms),
    conflictCeiling: normalizeConflictCeiling(record.conflictCeiling),
    resolutionStyle: normalizeText(record.resolutionStyle, DEFAULT_STORY_MODE_PROFILE.resolutionStyle),
    chapterUnit: normalizeText(record.chapterUnit, DEFAULT_STORY_MODE_PROFILE.chapterUnit),
    volumeReward: normalizeText(record.volumeReward, DEFAULT_STORY_MODE_PROFILE.volumeReward),
    mandatorySignals: normalizeList(record.mandatorySignals, DEFAULT_STORY_MODE_PROFILE.mandatorySignals),
    antiSignals: normalizeList(record.antiSignals, DEFAULT_STORY_MODE_PROFILE.antiSignals),
  });
}

export function parseStoryModeProfileJson(profileJson: string | null | undefined): StoryModeProfile {
  if (!profileJson?.trim()) {
    return DEFAULT_STORY_MODE_PROFILE;
  }
  try {
    return sanitizeStoryModeProfile(JSON.parse(profileJson));
  } catch {
    return DEFAULT_STORY_MODE_PROFILE;
  }
}

export function serializeStoryModeProfile(profile: unknown): string {
  return JSON.stringify(sanitizeStoryModeProfile(profile));
}

type StoryModeRow = {
  id: string;
  name: string;
  description?: string | null;
  template?: string | null;
  parentId?: string | null;
  profileJson?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function normalizeStoryModeOutput<T extends StoryModeRow>(
  storyMode: T,
): Omit<T, "profileJson" | "createdAt" | "updatedAt"> & NovelStoryMode {
  const { profileJson, createdAt, updatedAt, ...rest } = storyMode;
  return {
    ...rest,
    profile: parseStoryModeProfileJson(profileJson),
    createdAt: typeof createdAt === "string" ? createdAt : createdAt.toISOString(),
    updatedAt: typeof updatedAt === "string" ? updatedAt : updatedAt.toISOString(),
  };
}

export function buildStoryModePromptBlock(input: {
  primary?: (Pick<NovelStoryMode, "id" | "name" | "description" | "template" | "profile">) | null;
  secondary?: (Pick<NovelStoryMode, "id" | "name" | "description" | "template" | "profile">) | null;
}): string {
  const sections: string[] = [];
  if (input.primary) {
    sections.push(formatSingleStoryModeBlock("主流派模式", input.primary, true));
  }
  if (input.secondary) {
    sections.push(formatSingleStoryModeBlock("副流派模式", input.secondary, false));
  }
  if (sections.length === 0) {
    return "";
  }
  return [
    "流派模式约束：主流派模式是硬约束，副流派模式只能补充风味，不能覆盖主模式的冲突上限和禁止信号。",
    ...sections,
  ].join("\n\n");
}

function formatSingleStoryModeBlock(
  label: string,
  storyMode: Pick<NovelStoryMode, "name" | "description" | "template" | "profile">,
  isPrimary: boolean,
): string {
  const profile = storyMode.profile;
  return [
    `${label}：${storyMode.name}`,
    storyMode.description ? `说明：${storyMode.description}` : "",
    storyMode.template ? `补充模板：${storyMode.template}` : "",
    `核心驱动：${profile.coreDrive}`,
    `读者奖励：${profile.readerReward}`,
    `章节推进单位：${profile.chapterUnit}`,
    `卷末兑现：${profile.volumeReward}`,
    `允许的冲突形式：${profile.allowedConflictForms.join("、")}`,
    `禁止的冲突形式：${profile.forbiddenConflictForms.join("、")}`,
    `冲突上限：${profile.conflictCeiling}`,
    `化解方式：${profile.resolutionStyle}`,
    `必须反复出现的信号：${profile.mandatorySignals.join("、")}`,
    `必须避免的跑偏信号：${profile.antiSignals.join("、")}`,
    `剧情主要推进单位：${profile.progressionUnits.join("、")}`,
    isPrimary
      ? "使用要求：后续规划与生成必须优先服从这一模式。"
      : "使用要求：只能作为补充风味，不得破坏主模式的边界。",
  ].filter(Boolean).join("\n");
}
