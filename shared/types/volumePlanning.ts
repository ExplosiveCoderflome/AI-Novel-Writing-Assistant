import type {
  VolumeChapterTargetRange,
  VolumeCountGuidance,
  VolumeCountRange,
} from "./novel";

export const MIN_TOTAL_CHAPTER_BUDGET = 12;
export const MAX_VOLUME_COUNT = 16;
export const DEFAULT_VOLUME_CHAPTER_TARGET_RANGE: VolumeChapterTargetRange = {
  min: 40,
  ideal: 55,
  max: 70,
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

export function buildHardPlannedVolumeRange(recommendedVolumeCount: number): VolumeCountRange {
  const normalizedCount = Math.max(1, Math.round(recommendedVolumeCount));
  if (normalizedCount <= 2) {
    return {
      min: normalizedCount,
      max: normalizedCount,
    };
  }
  if (normalizedCount <= 4) {
    return {
      min: 2,
      max: normalizedCount,
    };
  }
  return {
    min: 2,
    max: 4,
  };
}

export function buildVolumeCountGuidance(params: {
  chapterBudget: number;
  existingVolumeCount?: number | null;
  respectExistingVolumeCount?: boolean;
  userPreferredVolumeCount?: number | null;
  maxVolumeCount?: number;
  targetChapterRange?: VolumeChapterTargetRange;
}): VolumeCountGuidance {
  const maxVolumeCount = Math.max(1, Math.round(params.maxVolumeCount ?? MAX_VOLUME_COUNT));
  const targetChapterRange = params.targetChapterRange ?? DEFAULT_VOLUME_CHAPTER_TARGET_RANGE;
  const chapterBudget = Math.max(
    MIN_TOTAL_CHAPTER_BUDGET,
    Math.round(Number.isFinite(params.chapterBudget) ? params.chapterBudget : MIN_TOTAL_CHAPTER_BUDGET),
  );

  const allowedVolumeCountRange: VolumeCountRange = {
    min: clampInteger(Math.ceil(chapterBudget / targetChapterRange.max), 1, maxVolumeCount),
    max: clampInteger(Math.ceil(chapterBudget / targetChapterRange.min), 1, maxVolumeCount),
  };
  if (allowedVolumeCountRange.max < allowedVolumeCountRange.min) {
    allowedVolumeCountRange.max = allowedVolumeCountRange.min;
  }

  const systemRecommendedVolumeCount = clampInteger(
    Math.round(chapterBudget / targetChapterRange.ideal),
    allowedVolumeCountRange.min,
    allowedVolumeCountRange.max,
  );

  const normalizedUserPreferredVolumeCount = normalizePositiveInteger(params.userPreferredVolumeCount);
  const userPreferredVolumeCount = normalizedUserPreferredVolumeCount == null
    ? null
    : clampInteger(
      normalizedUserPreferredVolumeCount,
      allowedVolumeCountRange.min,
      allowedVolumeCountRange.max,
    );

  const normalizedExistingVolumeCount = normalizePositiveInteger(params.existingVolumeCount);
  const respectedExistingVolumeCount = (
    params.respectExistingVolumeCount !== false
    && userPreferredVolumeCount == null
    && normalizedExistingVolumeCount != null
  )
    ? clampInteger(
      normalizedExistingVolumeCount,
      allowedVolumeCountRange.min,
      allowedVolumeCountRange.max,
    )
    : null;

  const recommendedVolumeCount = userPreferredVolumeCount
    ?? respectedExistingVolumeCount
    ?? systemRecommendedVolumeCount;

  return {
    chapterBudget,
    targetChapterRange,
    allowedVolumeCountRange,
    recommendedVolumeCount,
    systemRecommendedVolumeCount,
    hardPlannedVolumeRange: buildHardPlannedVolumeRange(recommendedVolumeCount),
    userPreferredVolumeCount,
    respectedExistingVolumeCount,
  };
}
