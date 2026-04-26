import type { VolumeBeatSheet } from "@ai-novel/shared/types/novel";

export function parseBeatSheetChapterSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const matches = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (matches.length === 0 || matches.some((value) => Number.isNaN(value))) {
    return null;
  }
  const start = Math.max(1, matches[0]);
  const end = Math.max(start, matches[matches.length - 1]);
  return { start, end };
}

export function getBeatSheetChapterSpanUpperBound(chapterSpanHint: string): number {
  return parseBeatSheetChapterSpan(chapterSpanHint)?.end ?? 0;
}

export function getBeatSheetChapterSpanCount(chapterSpanHint: string): number {
  const span = parseBeatSheetChapterSpan(chapterSpanHint);
  if (!span) {
    return 0;
  }
  return Math.max(1, span.end - span.start + 1);
}

export function sumBeatSheetChapterSpanCounts(
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined,
): number {
  if (!beatSheet || !Array.isArray(beatSheet.beats)) {
    return 0;
  }
  return beatSheet.beats.reduce((sum, beat) => sum + getBeatSheetChapterSpanCount(beat.chapterSpanHint), 0);
}

export function inferRequiredChapterCountFromBeatSheet(
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined,
): number {
  if (!beatSheet || !Array.isArray(beatSheet.beats)) {
    return 0;
  }

  return beatSheet.beats.reduce((maxValue, beat) => {
    const upperBound = getBeatSheetChapterSpanUpperBound(beat.chapterSpanHint);
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}

export function inferContinuousChapterCoverageFromBeatSheet(
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined,
): number {
  if (!beatSheet || !Array.isArray(beatSheet.beats)) {
    return 0;
  }

  const spans = beatSheet.beats
    .map((beat) => parseBeatSheetChapterSpan(beat.chapterSpanHint))
    .filter((span): span is { start: number; end: number } => Boolean(span))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  let continuousEnd = 0;
  for (const span of spans) {
    if (span.start > continuousEnd + 1) {
      break;
    }
    continuousEnd = Math.max(continuousEnd, span.end);
  }
  return continuousEnd;
}

export function resolveTargetChapterCount(input: {
  budgetedChapterCount: number;
  beatSheetRequiredChapterCount: number;
}): {
  targetChapterCount: number;
  beatSheetCountAccepted: boolean;
  maxTrustedChapterCount: number;
} {
  const budgetedChapterCount = Math.max(3, Math.round(input.budgetedChapterCount || 0));
  const beatSheetRequiredChapterCount = Math.max(0, Math.round(input.beatSheetRequiredChapterCount || 0));
  const maxTrustedChapterCount = budgetedChapterCount + Math.max(6, Math.ceil(budgetedChapterCount * 0.25));

  if (beatSheetRequiredChapterCount === 0) {
    return {
      targetChapterCount: budgetedChapterCount,
      beatSheetCountAccepted: false,
      maxTrustedChapterCount,
    };
  }

  if (beatSheetRequiredChapterCount > maxTrustedChapterCount) {
    return {
      targetChapterCount: budgetedChapterCount,
      beatSheetCountAccepted: false,
      maxTrustedChapterCount,
    };
  }

  return {
    targetChapterCount: Math.max(budgetedChapterCount, beatSheetRequiredChapterCount),
    beatSheetCountAccepted: true,
    maxTrustedChapterCount,
  };
}

export function validateBeatSheetChapterCoverage(input: {
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined;
  targetChapterCount: number;
  toleranceChapterCount?: number;
}): {
  accepted: boolean;
  targetChapterCount: number;
  requiredChapterCount: number;
  continuousChapterCount: number;
  plannedChapterCount: number;
  minTrustedChapterCount: number;
  maxTrustedChapterCount: number;
  message: string | null;
} {
  const targetChapterCount = Math.max(3, Math.round(input.targetChapterCount || 0));
  const requiredChapterCount = inferRequiredChapterCountFromBeatSheet(input.beatSheet);
  const continuousChapterCount = inferContinuousChapterCoverageFromBeatSheet(input.beatSheet);
  const plannedChapterCount = sumBeatSheetChapterSpanCounts(input.beatSheet);
  const toleranceChapterCount = Math.max(
    2,
    Math.round(input.toleranceChapterCount ?? Math.max(3, Math.ceil(targetChapterCount * 0.08))),
  );
  const minTrustedChapterCount = Math.max(1, targetChapterCount - toleranceChapterCount);
  const maxTrustedChapterCount = targetChapterCount + toleranceChapterCount;

  if (requiredChapterCount < minTrustedChapterCount || requiredChapterCount > maxTrustedChapterCount) {
    return {
      accepted: false,
      targetChapterCount,
      requiredChapterCount,
      continuousChapterCount,
      plannedChapterCount,
      minTrustedChapterCount,
      maxTrustedChapterCount,
      message: `当前卷节奏板章节跨度应覆盖约 ${targetChapterCount} 章，实际只覆盖到 ${requiredChapterCount} 章。`,
    };
  }
  if (continuousChapterCount < minTrustedChapterCount) {
    return {
      accepted: false,
      targetChapterCount,
      requiredChapterCount,
      continuousChapterCount,
      plannedChapterCount,
      minTrustedChapterCount,
      maxTrustedChapterCount,
      message: `当前卷节奏板章节跨度应从第 1 章连续覆盖到约 ${targetChapterCount} 章，实际连续覆盖到第 ${continuousChapterCount} 章。`,
    };
  }
  if (plannedChapterCount < minTrustedChapterCount || plannedChapterCount > maxTrustedChapterCount) {
    return {
      accepted: false,
      targetChapterCount,
      requiredChapterCount,
      continuousChapterCount,
      plannedChapterCount,
      minTrustedChapterCount,
      maxTrustedChapterCount,
      message: `当前卷节奏板章节跨度合计应约 ${targetChapterCount} 章，实际合计 ${plannedChapterCount} 章。`,
    };
  }

  return {
    accepted: true,
    targetChapterCount,
    requiredChapterCount,
    continuousChapterCount,
    plannedChapterCount,
    minTrustedChapterCount,
    maxTrustedChapterCount,
    message: null,
  };
}
