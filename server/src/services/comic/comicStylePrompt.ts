/**
 * 漫画画风关键词解析（单一来源）
 *
 * 所有漫画相关图像生成（角色三视图、表情稿、角色资产、场景设定图、格子图）
 * 都应通过此函数注入项目画风，保证整本风格统一。
 *
 * 画风来自 ComicProject.stylePreset(JSON).style（webtoon_color / ink_traditional 等）；
 * 注意 stylePreset.promptKeywords 是「漫画形态」（竖条漫/四格）关键词，不是画风。
 */

interface StyleEntry {
  zh: string;
  en: string;
}

// 与前端 ComicProjectPage STYLE_OPTIONS 的 value 对应
const STYLE_KEYWORDS: Record<string, StyleEntry> = {
  webtoon_color: { zh: "彩色韩漫风格，干净线条，鲜艳配色", en: "Korean webtoon style, clean line art, vibrant colors" },
  bl_manga: { zh: "彩色少女漫风格，柔和色调，精致五官", en: "shoujo manga style, soft palette, delicate features" },
  shounen_bw: { zh: "黑白少年漫风格，粗犷线条，动感构图", en: "black-and-white shounen manga, bold ink line art, dynamic composition" },
  ink_traditional: { zh: "水墨国风，传统毛笔笔触，淡彩晕染", en: "traditional Chinese ink-wash painting style, brush strokes, muted washed colors" },
  chibi: { zh: "Q版萌漫风格，圆润可爱，夸张表情", en: "chibi / SD cute manga style, round soft proportions" },
  realistic: { zh: "写实漫画风格，细腻光影，真实感", en: "semi-realistic illustration style, detailed shading and lighting" },
};

const DEFAULT_STYLE: StyleEntry = STYLE_KEYWORDS.webtoon_color;

function resolveStyleEntry(stylePresetRaw: string | null | undefined): StyleEntry {
  if (!stylePresetRaw) return DEFAULT_STYLE;
  try {
    const parsed = JSON.parse(stylePresetRaw) as { style?: string };
    if (parsed.style && STYLE_KEYWORDS[parsed.style]) return STYLE_KEYWORDS[parsed.style];
  } catch { /* ignore */ }
  return DEFAULT_STYLE;
}

/** 返回中英组合画风关键词串，直接拼入图像 prompt */
export function resolveComicStyleKeywords(stylePresetRaw: string | null | undefined): string {
  const entry = resolveStyleEntry(stylePresetRaw);
  return `${entry.zh}，${entry.en}`;
}

/** 仅英文画风片段（用于以英文为主的 prompt） */
export function resolveComicStyleKeywordsEn(stylePresetRaw: string | null | undefined): string {
  return resolveStyleEntry(stylePresetRaw).en;
}
