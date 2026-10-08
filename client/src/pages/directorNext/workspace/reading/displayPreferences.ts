export type ReadingDisplayFont = "default" | "song" | "sans" | "kai";

export interface ReadingDisplayPreferences {
  fontSize: number;
  font: ReadingDisplayFont;
}

const STORAGE_KEY = "ai-novel:director-v2:reading-display:v1";
export const READING_FONT_SIZE_MIN = 14;
export const READING_FONT_SIZE_MAX = 32;
export const DEFAULT_READING_DISPLAY: Readonly<ReadingDisplayPreferences> = {fontSize: 17, font: "default"};
export const READING_FONT_OPTIONS: ReadonlyArray<{value: ReadingDisplayFont; label: string; family: string}> = [
  {value: "default", label: "默认衬线", family: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'},
  {value: "song", label: "宋体", family: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif'},
  {value: "sans", label: "微软雅黑", family: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'},
  {value: "kai", label: "楷体", family: '"KaiTi", "STKaiti", serif'},
];

export function normalizeReadingDisplayPreferences(value: unknown): ReadingDisplayPreferences {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const fontSize = typeof row.fontSize === "number" && Number.isFinite(row.fontSize)
    ? Math.min(READING_FONT_SIZE_MAX, Math.max(READING_FONT_SIZE_MIN, Math.round(row.fontSize)))
    : DEFAULT_READING_DISPLAY.fontSize;
  const font = READING_FONT_OPTIONS.find(option => option.value === row.font)?.value ?? DEFAULT_READING_DISPLAY.font;
  return {fontSize, font};
}

export function loadReadingDisplayPreferences(storage: Pick<Storage, "getItem"> | null): ReadingDisplayPreferences {
  try {
    return normalizeReadingDisplayPreferences(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return {...DEFAULT_READING_DISPLAY};
  }
}

export function saveReadingDisplayPreferences(preferences: ReadingDisplayPreferences, storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeReadingDisplayPreferences(preferences)));
  } catch {
    // Reading remains adjustable when browser storage is unavailable.
  }
}

export function readingTextStyle(preferences: ReadingDisplayPreferences): {fontSize: string; fontFamily: string} {
  const safe = normalizeReadingDisplayPreferences(preferences);
  return {fontSize: `${safe.fontSize}px`, fontFamily: READING_FONT_OPTIONS.find(option => option.value === safe.font)!.family};
}
