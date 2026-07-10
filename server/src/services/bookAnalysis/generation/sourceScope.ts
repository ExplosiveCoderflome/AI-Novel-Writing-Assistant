interface BookAnalysisSourceScope {
  content: string;
  sourceScopeKey: string;
  label: string | null;
}

export function buildBookAnalysisSourceScope(analysis: {
  documentVersion: { content: string };
  sourceStartChapterIndex: number | null;
  sourceEndChapterIndex: number | null;
  sourceStartOffset: number | null;
  sourceEndOffset: number | null;
  sourceScopeLabel: string | null;
}): BookAnalysisSourceScope {
  const fullContent = analysis.documentVersion.content;
  const hasChapterRange = analysis.sourceStartChapterIndex !== null || analysis.sourceEndChapterIndex !== null;
  if (!hasChapterRange) {
    return { content: fullContent, sourceScopeKey: "full", label: null };
  }
  const startOffset = analysis.sourceStartOffset;
  const endOffset = analysis.sourceEndOffset;
  if (
    startOffset === null ||
    endOffset === null ||
    startOffset < 0 ||
    endOffset <= startOffset ||
    endOffset > fullContent.length ||
    analysis.sourceStartChapterIndex === null ||
    analysis.sourceEndChapterIndex === null
  ) {
    console.warn(
      `[bookAnalysis] source range offsets invalid for analysis ` +
        `(chapterRange=${analysis.sourceStartChapterIndex}-${analysis.sourceEndChapterIndex}, ` +
        `offsets=${startOffset}-${endOffset}, contentLen=${fullContent.length}). ` +
        `Falling back to full content.`,
    );
    return { content: fullContent, sourceScopeKey: "full", label: analysis.sourceScopeLabel };
  }
  return {
    content: fullContent.slice(startOffset, endOffset),
    sourceScopeKey: `chapters:${analysis.sourceStartChapterIndex}-${analysis.sourceEndChapterIndex}:${startOffset}-${endOffset}`,
    label: analysis.sourceScopeLabel,
  };
}
