export interface CharacterImagePromptCharacterContext {
  name: string;
  role: string;
  personality: string;
  appearance?: string | null;
  background: string;
}

export interface BuildCharacterImagePromptInput {
  prompt: string;
  stylePreset?: string | null;
  character: CharacterImagePromptCharacterContext;
}

export interface NovelCoverImagePromptNovelContext {
  title: string;
  description?: string | null;
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags?: string[] | null;
  genreLabel?: string | null;
  primaryStoryModeLabel?: string | null;
  secondaryStoryModeLabel?: string | null;
  worldName?: string | null;
  worldSummary?: string | null;
  styleTone?: string | null;
  narrativePovLabel?: string | null;
  pacePreferenceLabel?: string | null;
  emotionIntensityLabel?: string | null;
}

export interface BuildNovelCoverImagePromptInput {
  prompt: string;
  stylePreset?: string | null;
  novel: NovelCoverImagePromptNovelContext;
}

export const DEFAULT_NOVEL_COVER_STYLE_PRESET = "电影感插画，强氛围，高辨识度，适合网文封面主画面";
export const DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT = "文字，书名，字幕，水印，logo，低清晰度，模糊，畸形，多余肢体";

function joinLabelValues(label: string, values: Array<string | null | undefined>): string {
  const normalized = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return normalized.length > 0 ? `${label}：${normalized.join(" / ")}` : "";
}

export function buildDefaultCharacterImageSourceDescription(character: {
  name: string;
  role?: string | null;
  appearance?: string | null;
  personality?: string | null;
}): string {
  const blocks = [
    `${character.name} 的角色形象图`,
    character.role ? `角色定位：${character.role}` : "",
    character.appearance ? `外貌体态：${character.appearance}` : "",
    character.personality ? `性格特征：${character.personality}` : "",
  ];
  return blocks.filter(Boolean).join("\n");
}

export function buildCharacterImagePrompt(input: BuildCharacterImagePromptInput): string {
  const blocks = [
    input.prompt.trim(),
    input.stylePreset?.trim() ? `Style preset: ${input.stylePreset.trim()}` : "",
    `Character name: ${input.character.name}`,
    `Character role: ${input.character.role}`,
    `Personality: ${input.character.personality}`,
    `Appearance: ${input.character.appearance ?? "Not specified"}`,
    `Background: ${input.character.background}`,
  ];
  return blocks.filter(Boolean).join("\n");
}

export function buildDefaultNovelCoverSourceDescription(novel: NovelCoverImagePromptNovelContext): string {
  const blocks = [
    `${novel.title} 的小说封面主画面`,
    novel.description?.trim() ? `一句话概述：${novel.description.trim()}` : "",
    novel.targetAudience?.trim() ? `目标读者：${novel.targetAudience.trim()}` : "",
    novel.bookSellingPoint?.trim() ? `核心卖点：${novel.bookSellingPoint.trim()}` : "",
    novel.competingFeel?.trim() ? `阅读气质：${novel.competingFeel.trim()}` : "",
    novel.first30ChapterPromise?.trim() ? `前30章兑现：${novel.first30ChapterPromise.trim()}` : "",
    novel.commercialTags?.length ? `商业标签：${novel.commercialTags.join("、")}` : "",
    novel.genreLabel?.trim() ? `题材基底：${novel.genreLabel.trim()}` : "",
    joinLabelValues("推进模式", [novel.primaryStoryModeLabel, novel.secondaryStoryModeLabel]),
    novel.worldSummary?.trim()
      ? `世界氛围：${novel.worldSummary.trim()}`
      : novel.worldName?.trim()
        ? `世界氛围：${novel.worldName.trim()}`
        : "",
    novel.styleTone?.trim() ? `文风关键词：${novel.styleTone.trim()}` : "",
    joinLabelValues("叙事与节奏", [novel.narrativePovLabel, novel.pacePreferenceLabel, novel.emotionIntensityLabel]),
    "封面目标：突出这本书最抓人的视觉卖点，生成不带文字的封面主画面。",
  ];
  return blocks.filter(Boolean).join("\n");
}

export function buildNovelCoverImagePrompt(input: BuildNovelCoverImagePromptInput): string {
  const blocks = [
    input.prompt.trim(),
    input.stylePreset?.trim() ? `Style preset: ${input.stylePreset.trim()}` : "",
    "Cover goal: vertical novel cover key art only, no title text, no subtitles, no watermark, no readable typography.",
    `Project title: ${input.novel.title}`,
    `Story premise: ${input.novel.description?.trim() || "Not specified"}`,
    `Target audience: ${input.novel.targetAudience?.trim() || "Not specified"}`,
    `Core selling point: ${input.novel.bookSellingPoint?.trim() || "Not specified"}`,
    `Reading feel: ${input.novel.competingFeel?.trim() || "Not specified"}`,
    `First 30 chapter payoff: ${input.novel.first30ChapterPromise?.trim() || "Not specified"}`,
    `Commercial tags: ${input.novel.commercialTags?.join(", ") || "Not specified"}`,
    `Genre: ${input.novel.genreLabel?.trim() || "Not specified"}`,
    `Primary story mode: ${input.novel.primaryStoryModeLabel?.trim() || "Not specified"}`,
    `Secondary story mode: ${input.novel.secondaryStoryModeLabel?.trim() || "Not specified"}`,
    `World frame: ${input.novel.worldSummary?.trim() || input.novel.worldName?.trim() || "Not specified"}`,
    `Tone keywords: ${input.novel.styleTone?.trim() || "Not specified"}`,
    `Narrative point of view: ${input.novel.narrativePovLabel?.trim() || "Not specified"}`,
    `Pacing preference: ${input.novel.pacePreferenceLabel?.trim() || "Not specified"}`,
    `Emotion intensity: ${input.novel.emotionIntensityLabel?.trim() || "Not specified"}`,
  ];
  return blocks.filter(Boolean).join("\n");
}
