export const CHAPTER_GENERATION_TRACE_SESSION_PREFIX = "chapter-gen-";

export function isChapterGenerationTraceRun(input: {
  chapterId?: string | null;
  sessionId?: string | null;
  entryAgent?: string | null;
}): boolean {
  return Boolean(
    input.chapterId
    && input.entryAgent === "Writer"
    && typeof input.sessionId === "string"
    && input.sessionId.startsWith(CHAPTER_GENERATION_TRACE_SESSION_PREFIX),
  );
}

export function buildAgentRunTaskCenterVisibilityWhere() {
  return {
    NOT: {
      chapterId: { not: null },
      sessionId: { startsWith: CHAPTER_GENERATION_TRACE_SESSION_PREFIX },
      entryAgent: "Writer",
    },
  };
}
