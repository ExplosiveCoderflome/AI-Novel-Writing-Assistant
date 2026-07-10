export type PreviewNovelRow = {
  id: string;
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  first30ChapterPromise: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  styleTone?: string | null;
  estimatedChapterCount?: number | null;
  characters?: PreviewCharacterRow[];
};

export type PreviewCharacterRow = {
  id: string;
  name: string;
  role: string;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
  identityLabel?: string | null;
  factionLabel?: string | null;
  stanceLabel?: string | null;
  powerLevel?: string | null;
  realm?: string | null;
  currentLocation?: string | null;
  availability?: string | null;
  prohibitionsJson?: string | null;
  currentState?: string | null;
  currentGoal?: string | null;
  appearance?: string | null;
  physique?: string | null;
  attireStyle?: string | null;
  signatureDetail?: string | null;
  voiceTexture?: string | null;
  presenceImpression?: string | null;
};

export type PreviewChapterRow = {
  id: string;
  title: string;
  order: number;
  content: string | null;
  expectation: string | null;
  targetWordCount: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid: string | null;
  taskSheet: string | null;
  sceneCards: string | null;
  hook: string | null;
};

export const PREVIEW_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function compactPreviewText(value: string | null | undefined, fallback = ""): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

export function truncatePreviewText(value: string | null | undefined, maxChars: number): string {
  const text = value?.trim() ?? "";
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n...[裁剪]`;
}

export function previewListBlock(
  title: string,
  values: Array<string | null | undefined>,
  emptyLabel = "none",
): string {
  const items = [...new Set(values.map((item) => compactPreviewText(item)).filter(Boolean))];
  if (items.length === 0) {
    return `${title}: ${emptyLabel}`;
  }
  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseSceneCards(value: string | null | undefined): Record<string, unknown>[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    const scenes = asRecord(parsed)?.scenes;
    return Array.isArray(scenes)
      ? scenes.map(asRecord).filter((scene): scene is Record<string, unknown> => Boolean(scene))
      : [];
  } catch {
    return [];
  }
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

export function readJsonStringList(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => readString(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}
