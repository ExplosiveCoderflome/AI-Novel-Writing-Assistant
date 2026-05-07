import { createContextBlock } from "../../core/contextBudget";
import type { PromptContextBlock } from "../../core/promptTypes";
import { genreProfileRegistry } from "../../references/genreProfileRegistry";
import type { GenreProfile } from "../../references/genreProfiles";
import { renderGenreGuidanceText } from "./chapterLayeredContextShared";

interface ReadingPowerBaseOptions {
  genreLabel?: string | null;
  profile?: GenreProfile | null;
}

interface ReadingPowerContextBlockOptions extends ReadingPowerBaseOptions {
  id?: string;
  group?: string;
  priority?: number;
  required?: boolean;
}

interface ReadingPowerTextSectionOptions extends ReadingPowerBaseOptions {
  title?: string;
}

function resolveProvidedOrDerivedProfile(options: ReadingPowerBaseOptions): GenreProfile | null {
  if (options.profile !== undefined) {
    return options.profile;
  }
  return genreProfileRegistry.resolve(options.genreLabel);
}

export function resolveReadingPowerProfile(genreLabel: string | null | undefined): GenreProfile | null {
  return genreProfileRegistry.resolve(genreLabel);
}

export function buildReadingPowerGuidanceText(options: ReadingPowerBaseOptions): string {
  const profile = resolveProvidedOrDerivedProfile(options);
  return renderGenreGuidanceText(profile);
}

export function buildReadingPowerContextBlock(
  options: ReadingPowerContextBlockOptions,
): PromptContextBlock | null {
  const content = buildReadingPowerGuidanceText(options);
  if (!content) {
    return null;
  }
  return createContextBlock({
    id: options.id ?? "genre_reading_power",
    group: options.group ?? "genre_reading_power",
    priority: options.priority ?? 76,
    required: options.required,
    content,
  });
}

export function buildReadingPowerTextSection(options: ReadingPowerTextSectionOptions): string {
  const content = buildReadingPowerGuidanceText(options);
  if (!content) {
    return "";
  }
  if (!options.title?.trim()) {
    return content;
  }
  return `${options.title.trim()}\n${content}`;
}
