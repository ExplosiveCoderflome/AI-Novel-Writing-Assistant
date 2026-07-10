import type { ResolvedStyleContext } from "@ai-novel/shared/types/styleEngine";

interface CharacterContextRow {
  name?: string | null;
  role?: string | null;
  personality?: string | null;
  appearance?: string | null;
  physique?: string | null;
  signatureDetail?: string | null;
  voiceTexture?: string | null;
}

function compactText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildPreviousChaptersSummary(
  requestSummary: string[] | undefined,
  summaries: Array<{ chapter: { order: number; title: string }; summary: string }>,
): string[] {
  if (requestSummary?.length) {
    return requestSummary;
  }
  return summaries.map((item) => `第${item.chapter.order}章《${item.chapter.title}》：${item.summary}`);
}

export function parseJsonStringArraySafe(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function buildCharactersContextText(characters: CharacterContextRow[]): string {
  return characters.map((character) => {
    const appearanceText = [character.appearance, character.physique]
      .map((value) => compactText(value))
      .filter(Boolean)
      .join("；");
    const visibleProfile = [
      appearanceText ? `样貌/体态=${appearanceText}` : "",
      character.signatureDetail ? `标志=${compactText(character.signatureDetail)}` : "",
      character.voiceTexture ? `声音=${compactText(character.voiceTexture)}` : "",
    ].filter(Boolean).join(" | ");
    return [
      [character.name, character.role].map((value) => compactText(value)).filter(Boolean).join(" / "),
      character.personality ? `性格=${compactText(character.personality)}` : "",
      visibleProfile ? `外显=${visibleProfile}` : "",
    ].filter(Boolean).join("\n");
  }).filter(Boolean).join("\n\n");
}

export function buildStyleEngineBlock(styleContext: ResolvedStyleContext | null | undefined): string {
  const sanitized = styleContext?.sanitizedGenerationProfile;
  if (!sanitized) {
    return "";
  }
  const forbiddenPlaceholders = sanitized.forbiddenEntities.map(() => "[source-entity]");
  return [
    "Style generation guidance:",
    ...sanitized.writingGuidance,
    forbiddenPlaceholders.length > 0
      ? `Forbidden source entities: ${forbiddenPlaceholders.join(", ")}`
      : "",
  ].filter(Boolean).join("\n");
}
