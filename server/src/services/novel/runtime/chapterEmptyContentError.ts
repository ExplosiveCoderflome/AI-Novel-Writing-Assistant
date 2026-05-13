export interface ChapterEmptyContentErrorDetails {
  novelId?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  source: string;
  rawLength: number;
  trimmedLength: number;
  attempt?: number | null;
  maxEmptyRetries?: number | null;
}

export class ChapterEmptyContentError extends Error {
  readonly code = "CHAPTER_EMPTY_CONTENT";
  readonly details: ChapterEmptyContentErrorDetails;

  constructor(details: ChapterEmptyContentErrorDetails, message = "章节生成未返回可保存的正文。") {
    super(message);
    this.name = "ChapterEmptyContentError";
    this.details = details;
    Object.setPrototypeOf(this, ChapterEmptyContentError.prototype);
  }
}

export function isChapterEmptyContentError(error: unknown): error is ChapterEmptyContentError {
  return error instanceof ChapterEmptyContentError
    || (
      Boolean(error)
      && typeof error === "object"
      && (error as { code?: unknown }).code === "CHAPTER_EMPTY_CONTENT"
    );
}

export function buildChapterEmptyContentError(
  content: string | null | undefined,
  details: Omit<ChapterEmptyContentErrorDetails, "rawLength" | "trimmedLength">,
): ChapterEmptyContentError {
  const raw = content ?? "";
  return new ChapterEmptyContentError({
    ...details,
    rawLength: raw.length,
    trimmedLength: raw.trim().length,
  });
}

export function assertChapterContentNotEmpty(
  content: string | null | undefined,
  details: Omit<ChapterEmptyContentErrorDetails, "rawLength" | "trimmedLength">,
): string {
  const raw = content ?? "";
  if (!raw.trim()) {
    throw buildChapterEmptyContentError(raw, details);
  }
  return raw;
}
