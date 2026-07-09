import type {
  VolumeChapterTargetRange,
  VolumeCountGuidance,
  VolumeCountRange,
  VolumeScaleProfile,
} from "./novel";

export const MIN_TOTAL_CHAPTER_BUDGET = 12;
export const MAX_VOLUME_COUNT = 24;
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
  if (normalizedCount <= 3) {
    return {
      min: normalizedCount,
      max: normalizedCount,
    };
  }
  if (normalizedCount <= 6) {
    return {
      min: 3,
      max: Math.min(4, normalizedCount),
    };
  }
  return {
    min: 3,
    max: Math.min(6, normalizedCount),
  };
}

function buildDecisionVolumeCountRange(chapterBudget: number, maxVolumeCount: number): {
  range: VolumeCountRange;
  profile: VolumeScaleProfile;
  rationale: string;
} {
  if (chapterBudget < 60) {
    return {
      range: { min: 1, max: Math.min(2, maxVolumeCount) },
      profile: "short",
      rationale: "短篇或短中篇可以保留一到两段结构，优先保证开局承诺和结尾兑现不被拆散。",
    };
  }
  if (chapterBudget < 120) {
    return {
      range: { min: 3, max: Math.min(4, maxVolumeCount) },
      profile: "compact",
      rationale: "60 章以上默认需要三段以上结构，避免压成开局卷和结局卷后中段失焦。",
    };
  }
  if (chapterBudget < 250) {
    return {
      range: { min: 4, max: Math.min(6, maxVolumeCount) },
      profile: "standard",
      rationale: "中篇体量需要多个阶段承诺，给开局、中段转向和后段兑现留出独立空间。",
    };
  }
  if (chapterBudget < 500) {
    return {
      range: { min: 6, max: Math.min(9, maxVolumeCount) },
      profile: "long",
      rationale: "长篇需要按卖点切换、压力升级和阶段兑现拆出更清晰的卷级节奏。",
    };
  }
  if (chapterBudget < 900) {
    return {
      range: { min: 9, max: Math.min(14, maxVolumeCount) },
      profile: "epic",
      rationale: "大长篇需要更多卷级回报节点，避免单卷过粗导致阶段感和追读动力变弱。",
    };
  }
  if (chapterBudget < 1500) {
    return {
      range: { min: 14, max: Math.min(20, maxVolumeCount) },
      profile: "epic",
      rationale: "超长篇需要保持卷级颗粒度，让地图、势力、能力和关系阶段逐步展开。",
    };
  }
  return {
    range: { min: 18, max: maxVolumeCount },
    profile: "mega",
    rationale: "超长篇默认接近最大卷数，优先保障长期连载的阶段兑现密度和后续可调度空间。",
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
    min: 1,
    max: maxVolumeCount,
  };
  if (allowedVolumeCountRange.max < allowedVolumeCountRange.min) {
    allowedVolumeCountRange.max = allowedVolumeCountRange.min;
  }

  const decisionGuidance = buildDecisionVolumeCountRange(chapterBudget, maxVolumeCount);
  const decisionVolumeCountRange: VolumeCountRange = {
    min: clampInteger(decisionGuidance.range.min, allowedVolumeCountRange.min, allowedVolumeCountRange.max),
    max: clampInteger(decisionGuidance.range.max, allowedVolumeCountRange.min, allowedVolumeCountRange.max),
  };
  if (decisionVolumeCountRange.max < decisionVolumeCountRange.min) {
    decisionVolumeCountRange.max = decisionVolumeCountRange.min;
  }

  const systemRecommendedVolumeCount = clampInteger(
    Math.round(chapterBudget / targetChapterRange.ideal),
    decisionVolumeCountRange.min,
    decisionVolumeCountRange.max,
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
    decisionVolumeCountRange,
    volumeScaleProfile: decisionGuidance.profile,
    volumeCountRationale: decisionGuidance.rationale,
    recommendedVolumeCount,
    systemRecommendedVolumeCount,
    hardPlannedVolumeRange: buildHardPlannedVolumeRange(recommendedVolumeCount),
    userPreferredVolumeCount,
    respectedExistingVolumeCount,
  };
}
