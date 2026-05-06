import type { DirectorProjectContextInput } from "@ai-novel/shared/types/novelDirector";
import {
  normalizeCommercialTags,
  type BookFramingSuggestion,
  type BookFramingSuggestionInput,
} from "@ai-novel/shared/types/novelFraming";

export interface DirectorBookFramingDraft {
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function pickDirectorBookFraming(input: DirectorProjectContextInput): DirectorBookFramingDraft {
  const commercialTags = normalizeCommercialTags(input.commercialTags);
  return {
    targetAudience: normalizeOptionalText(input.targetAudience),
    bookSellingPoint: normalizeOptionalText(input.bookSellingPoint),
    competingFeel: normalizeOptionalText(input.competingFeel),
    first30ChapterPromise: normalizeOptionalText(input.first30ChapterPromise),
    commercialTags: commercialTags.length > 0 ? commercialTags : undefined,
  };
}

function isBookFramingComplete(input: DirectorBookFramingDraft): boolean {
  return Boolean(
    input.targetAudience
      && input.bookSellingPoint
      && input.competingFeel
      && input.first30ChapterPromise
      && input.commercialTags
      && input.commercialTags.length > 0,
  );
}

export async function resolveDirectorBookFraming(input: {
  context: DirectorProjectContextInput;
  title: string;
  description: string;
  genreLabel?: string;
  suggest: (input: BookFramingSuggestionInput) => Promise<BookFramingSuggestion>;
}): Promise<DirectorBookFramingDraft> {
  const provided = pickDirectorBookFraming(input.context);
  if (isBookFramingComplete(provided)) {
    return provided;
  }

  try {
    const suggested = await input.suggest({
      title: input.title,
      description: input.description,
      genreLabel: input.genreLabel,
      styleTone: normalizeOptionalText(input.context.styleTone),
    });
    const suggestedTags = normalizeCommercialTags(suggested.commercialTags);
    return {
      targetAudience: provided.targetAudience ?? normalizeOptionalText(suggested.targetAudience),
      bookSellingPoint: provided.bookSellingPoint ?? normalizeOptionalText(suggested.bookSellingPoint),
      competingFeel: provided.competingFeel ?? normalizeOptionalText(suggested.competingFeel),
      first30ChapterPromise: provided.first30ChapterPromise ?? normalizeOptionalText(suggested.first30ChapterPromise),
      commercialTags: provided.commercialTags && provided.commercialTags.length > 0
        ? provided.commercialTags
        : (suggestedTags.length > 0 ? suggestedTags : undefined),
    };
  } catch {
    return provided;
  }
}
